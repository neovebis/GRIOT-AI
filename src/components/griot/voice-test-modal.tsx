import { useEffect, useRef, useState } from "react";
import { Mic, Volume2, Camera, X, Play, Square, Video, CheckCircle2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { loadPrefs } from "@/lib/settings";
import { resolveSpeechLanguage } from "@/lib/speech-transcriber";

interface VoiceTestModalProps {
  open: boolean;
  onClose: () => void;
  mode?: "voice" | "mic" | "camera";
}

export function VoiceTestModal({ open, onClose, mode = "voice" }: VoiceTestModalProps) {
  const t = useT();
  const [activeTab, setActiveTab] = useState<"voice" | "mic" | "camera">(mode);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    setActiveTab(mode);
  }, [mode]);

  useEffect(() => {
    if (!open) {
      cleanup();
    }
  }, [open]);

  const cleanup = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setIsListening(false);
    setAudioLevel(0);
    setCameraActive(false);

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  };

  const handleTestVoice = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const prefs = loadPrefs();
    const voiceSpeed = parseFloat(String(prefs.voiceSpeed || "1.0").replace("×", "")) || 1.0;
    const voiceType = String(prefs.voice || "GRIOT Nativa");

    const langInfo = resolveSpeechLanguage(
      (prefs.voiceLanguage as string) || (prefs.appLanguage as string),
    );

    let sampleText =
      "Olá! O núcleo de voz do GRIOT e o ModelOS estão operacionais com transcrição de ultra-precisão e pausa suave.";
    if (langInfo.code === "en") {
      sampleText =
        "Hello! The GRIOT voice engine and ModelOS are fully active with advanced speech recognition and soft pause.";
    } else if (langInfo.code === "es") {
      sampleText =
        "¡Hola! El núcleo de voz de GRIOT y ModelOS están activos con transcripción avanzada y pausa suave.";
    } else if (langInfo.code === "fr") {
      sampleText =
        "Bonjour ! Le moteur vocal de GRIOT et ModelOS sont opérationnels avec transcription avancée.";
    } else if (langInfo.code === "de") {
      sampleText =
        "Hallo! Die GRIOT-Sprach-Engine und ModelOS sind einsatzbereit mit fortschrittlicher Spracherkennung.";
    }

    const utterance = new SpeechSynthesisUtterance(sampleText);
    utterance.rate = voiceSpeed;
    utterance.lang = langInfo.bcp47;

    // Pitch based on selected voice
    if (voiceType.toLowerCase().includes("grave") || voiceType.toLowerCase().includes("deep")) {
      utterance.pitch = 0.75;
    } else if (
      voiceType.toLowerCase().includes("serena") ||
      voiceType.toLowerCase().includes("calm")
    ) {
      utterance.pitch = 1.18;
    } else {
      utterance.pitch = 1.0;
    }

    const voices = window.speechSynthesis.getVoices();
    const langVoices = voices.filter((v) =>
      v.lang.toLowerCase().replace("_", "-").startsWith(langInfo.code),
    );
    const selectedVoiceName = voiceType.toLowerCase();
    const matchedVoice =
      langVoices.find((v) => v.name.toLowerCase().includes(selectedVoiceName)) || langVoices[0];
    if (matchedVoice) utterance.voice = matchedVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const handleToggleMicTest = async () => {
    if (isListening) {
      cleanup();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setIsListening(true);

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();
    } catch {
      setIsListening(false);
    }
  };

  const handleToggleCameraTest = async () => {
    if (cameraActive) {
      cleanup();
      return;
    }

    try {
      const prefs = loadPrefs();
      const quality = String(prefs.mediaQuality || "Alta");
      const height = quality === "Máxima" ? 1080 : quality === "Alta" ? 720 : 480;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { height: { ideal: height }, facingMode: "user" },
      });
      mediaStreamRef.current = stream;
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play();
      }
    } catch {
      setCameraActive(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/65 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-[26px] border border-hairline bg-surface p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className="size-5 text-primary" />
            <h3 className="text-[18px] font-semibold text-foreground">
              {t("Teste de Hardware & Multimédia")}
            </h3>
          </div>
          <button
            onClick={() => {
              cleanup();
              onClose();
            }}
            className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-full bg-secondary/50 p-1 border border-hairline">
          <button
            onClick={() => {
              cleanup();
              setActiveTab("voice");
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-medium transition-colors ${
              activeTab === "voice"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            <Volume2 className="size-3.5" />
            <span>{t("Voz GRIOT")}</span>
          </button>
          <button
            onClick={() => {
              cleanup();
              setActiveTab("mic");
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-medium transition-colors ${
              activeTab === "mic"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            <Mic className="size-3.5" />
            <span>{t("Microfone")}</span>
          </button>
          <button
            onClick={() => {
              cleanup();
              setActiveTab("camera");
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-medium transition-colors ${
              activeTab === "camera"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            <Camera className="size-3.5" />
            <span>{t("Câmara")}</span>
          </button>
        </div>

        {/* Tab 1: Voice test */}
        {activeTab === "voice" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-secondary/30 border border-hairline p-4 text-center space-y-2">
              <p className="text-[13.5px] text-foreground font-medium">
                {t("Demonstração da síntese de voz nativa")}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {t(
                  "Testa a velocidade, entoação e o sintetizador local do browser com o texto do assistente.",
                )}
              </p>
            </div>

            <div className="flex justify-center py-4">
              <button
                onClick={handleTestVoice}
                className={`flex items-center gap-2.5 rounded-full px-6 py-3.5 text-[14.5px] font-semibold transition-all shadow-md active:scale-95 ${
                  isSpeaking
                    ? "bg-destructive text-destructive-foreground animate-pulse"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                }`}
              >
                {isSpeaking ? <Square className="size-4" /> : <Play className="size-4" />}
                <span>{isSpeaking ? t("Parar Reprodução") : t("Ouvir Frase de Teste")}</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Mic test */}
        {activeTab === "mic" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-secondary/30 border border-hairline p-4 text-center space-y-2">
              <p className="text-[13.5px] text-foreground font-medium">
                {t("Medidor de Entrada de Áudio")}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {t(
                  "Fala para o microfone para testar o nível de captação e sensibilidade em tempo real.",
                )}
              </p>
            </div>

            <div className="space-y-2 py-2">
              <div className="flex justify-between text-[11.5px] text-muted-foreground font-mono">
                <span>{t("Nível de Entrada")}</span>
                <span>{audioLevel}%</span>
              </div>
              <div className="h-4 w-full overflow-hidden rounded-full bg-secondary border border-hairline">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 transition-all duration-75"
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={handleToggleMicTest}
                className={`flex items-center gap-2.5 rounded-full px-6 py-3.5 text-[14.5px] font-semibold transition-all shadow-md active:scale-95 ${
                  isListening
                    ? "bg-emerald-500 text-white"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                }`}
              >
                <Mic className="size-4" />
                <span>
                  {isListening ? t("A Escutar… (Clique para parar)") : t("Ligar Microfone")}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Camera test */}
        {activeTab === "camera" && (
          <div className="space-y-4">
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black border border-hairline flex items-center justify-center">
              {cameraActive ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-center text-muted-foreground space-y-2">
                  <Video className="size-10 mx-auto opacity-50" />
                  <p className="text-[13px]">{t("Câmara desligada")}</p>
                </div>
              )}
            </div>

            <div className="flex justify-center">
              <button
                onClick={handleToggleCameraTest}
                className={`flex items-center gap-2.5 rounded-full px-6 py-3.5 text-[14.5px] font-semibold transition-all shadow-md active:scale-95 ${
                  cameraActive
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                }`}
              >
                <Camera className="size-4" />
                <span>
                  {cameraActive ? t("Desligar Câmara") : t("Testar Visualizador de Câmara")}
                </span>
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-hairline">
          <button
            onClick={() => {
              cleanup();
              onClose();
            }}
            className="flex items-center gap-1.5 rounded-full bg-secondary hover:bg-secondary/80 px-5 py-2 text-[13px] font-medium text-foreground transition-colors"
          >
            <CheckCircle2 className="size-4 text-emerald-500" />
            <span>{t("Concluir Teste")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
