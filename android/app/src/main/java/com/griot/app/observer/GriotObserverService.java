package com.griot.app.observer;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import com.griot.app.plugin.GriotPlugin;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * GriotObserverService
 * Servico de Acessibilidade nativo do Android para o GRIOT.
 *
 * Comunica diretamente com as apps de IA externas (ChatGPT, Claude, Gemini,
 * DeepSeek, Kimi, Grok, Perplexity, Mistral), injeta prompts na thread vinculada,
 * observa a resposta gerada em tempo real e transmite os dados para o GRIOT,
 * mantendo a experiencia do utilizador fluida via Overlay de cobertura.
 */
public class GriotObserverService extends AccessibilityService {

    private static final String TAG = "GriotObserverService";
    public static final String ACTION_GRIOT_EVENT = "com.griot.app.OBSERVER_EVENT";

    private static GriotObserverService instance;

    public static final Set<String> MONITORED_PACKAGES = new HashSet<>(Arrays.asList(
        "com.openai.chatgpt",
        "com.anthropic.claude",
        "com.google.gemini",
        "com.google.android.apps.bard",
        "com.deepseek.chat",
        "com.moonshot.kimi",
        "ai.x.grok",
        "ai.perplexity.app.android",
        "ai.mistral.chat"
    ));

    public enum ObserverState {
        IDLE,
        INJECTING,
        WAITING_FOR_RESPONSE,
        STREAMING_RESPONSE,
        COMPLETED
    }

    // Estado da automacao e observacao ativa
    private ObserverState currentState = ObserverState.IDLE;
    private String activeFixedThreadTitle = "";
    private String activePackageTarget = "";
    private String activePromptMessage = "";
    private String lastStreamedText = "";
    private String lastScreenSignature = "";
    private long lastScreenDispatchTime = 0L;
    private String lastError = "";

    // Componentes de Overlay Nativo
    private WindowManager windowManager;
    private View overlayView;
    private TextView overlayStatusText;
    private TextView overlaySubtext;

    private final Handler automationHandler = new Handler(Looper.getMainLooper());

    private final Runnable finishObservationRunnable = new Runnable() {
        @Override
        public void run() {
            if ((currentState == ObserverState.WAITING_FOR_RESPONSE || currentState == ObserverState.STREAMING_RESPONSE)
                && !lastStreamedText.isEmpty()) {
                Log.i(TAG, "Observacao concluida para " + activePackageTarget + ". Total chars: " + lastStreamedText.length());
                GriotPlugin.dispatchStreamChunk(activeFixedThreadTitle, lastStreamedText, true);
                currentState = ObserverState.COMPLETED;
                updateOverlayStatus("GRIOT OBSERVER", "Resposta recebida com sucesso!");
                automationHandler.postDelayed(() -> {
                    hideOverlay();
                    returnToGriot();
                    currentState = ObserverState.IDLE;
                }, 300);
            }
        }
    };

    private final Runnable safetyReturnRunnable = new Runnable() {
        @Override
        public void run() {
            if (currentState != ObserverState.IDLE && currentState != ObserverState.COMPLETED) {
                Log.w(TAG, "Temporizador de seguranca disparado para " + activePackageTarget);
                if (!lastStreamedText.isEmpty()) {
                    GriotPlugin.dispatchStreamChunk(activeFixedThreadTitle, lastStreamedText, true);
                } else {
                    dispatchAutomationResult(false, "Tempo limite excedido ao aguardar resposta de " + resolveAppName(activePackageTarget));
                }
                currentState = ObserverState.IDLE;
                hideOverlay();
                returnToGriot();
            }
        }
    };

    public static GriotObserverService getInstance() {
        return instance;
    }

    public String getLastError() {
        return lastError;
    }

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        Log.i(TAG, "GriotObserverService ligado e ativo no Android com Thread Binding.");

        AccessibilityServiceInfo info = new AccessibilityServiceInfo();
        info.eventTypes = AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED |
                          AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED |
                          AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED;
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
        info.flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS |
                     AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS |
                     AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS;
        info.notificationTimeout = 80;
        setServiceInfo(info);
    }

    // =========================================================================
    // OVERLAY NATIVO (SISTEMA DE COBERTURA VISUAL)
    // =========================================================================

    private void showOverlay(String appName) {
        automationHandler.post(() -> {
            try {
                if (overlayView != null) {
                    updateOverlayStatus("A comunicar com " + appName, "A preparar mensagem...");
                    return;
                }

                windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
                if (windowManager == null) return;

                LinearLayout layout = new LinearLayout(this);
                layout.setOrientation(LinearLayout.VERTICAL);
                layout.setGravity(Gravity.CENTER);
                layout.setBackgroundColor(Color.parseColor("#0b0f19")); // Dark GRIOT background
                int pad = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 28, getResources().getDisplayMetrics());
                layout.setPadding(pad, pad, pad, pad);

                // Titulo
                TextView title = new TextView(this);
                title.setText("GRIOT OBSERVER");
                title.setTextColor(Color.parseColor("#818cf8")); // Indigo
                title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
                title.setTypeface(Typeface.DEFAULT_BOLD);
                title.setGravity(Gravity.CENTER);
                layout.addView(title);

                // Espacador
                View space1 = new View(this);
                int spaceH = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 18, getResources().getDisplayMetrics());
                layout.addView(space1, new LinearLayout.LayoutParams(1, spaceH));

                // Spinner de Carregamento
                ProgressBar spinner = new ProgressBar(this);
                spinner.setIndeterminate(true);
                layout.addView(spinner);

                // Espacador
                View space2 = new View(this);
                layout.addView(space2, new LinearLayout.LayoutParams(1, spaceH));

                // Texto de Estado
                overlayStatusText = new TextView(this);
                overlayStatusText.setText("A comunicar com " + appName);
                overlayStatusText.setTextColor(Color.WHITE);
                overlayStatusText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
                overlayStatusText.setTypeface(Typeface.DEFAULT_BOLD);
                overlayStatusText.setGravity(Gravity.CENTER);
                layout.addView(overlayStatusText);

                // Subtexto descritivo
                overlaySubtext = new TextView(this);
                overlaySubtext.setText("A enviar mensagem em segundo plano...");
                overlaySubtext.setTextColor(Color.parseColor("#94a3b8"));
                overlaySubtext.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
                overlaySubtext.setGravity(Gravity.CENTER);
                int subPadTop = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 8, getResources().getDisplayMetrics());
                overlaySubtext.setPadding(0, subPadTop, 0, 0);
                layout.addView(overlaySubtext);

                // Espacador para o botao
                View space3 = new View(this);
                int spaceH3 = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 32, getResources().getDisplayMetrics());
                layout.addView(space3, new LinearLayout.LayoutParams(1, spaceH3));

                // Botao Cancelar
                Button cancelBtn = new Button(this);
                cancelBtn.setText("Cancelar");
                cancelBtn.setTextColor(Color.parseColor("#cbd5e1"));
                cancelBtn.setBackgroundColor(Color.parseColor("#1e293b"));
                cancelBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
                cancelBtn.setOnClickListener(v -> cancelAndReturnToGriot());
                layout.addView(cancelBtn);

                WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE |
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN |
                    WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS,
                    PixelFormat.TRANSLUCENT
                );
                params.gravity = Gravity.CENTER;

                overlayView = layout;
                windowManager.addView(overlayView, params);
            } catch (Exception e) {
                Log.w(TAG, "Nao foi possivel exibir overlay de acessibilidade: " + e.getMessage());
            }
        });
    }

    private void updateOverlayStatus(String status, String subtext) {
        automationHandler.post(() -> {
            try {
                if (overlayStatusText != null && status != null) overlayStatusText.setText(status);
                if (overlaySubtext != null && subtext != null) overlaySubtext.setText(subtext);
            } catch (Exception ignored) {}
        });
    }

    private void hideOverlay() {
        automationHandler.post(() -> {
            try {
                if (overlayView != null && windowManager != null) {
                    windowManager.removeView(overlayView);
                }
            } catch (Exception ignored) {
            } finally {
                overlayView = null;
                overlayStatusText = null;
                overlaySubtext = null;
            }
        });
    }

    private void cancelAndReturnToGriot() {
        automationHandler.removeCallbacks(finishObservationRunnable);
        automationHandler.removeCallbacks(safetyReturnRunnable);
        currentState = ObserverState.IDLE;
        hideOverlay();
        returnToGriot();
    }

    // =========================================================================
    // EVENTOS DE ACESSIBILIDADE E EXTRACAO
    // =========================================================================

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        CharSequence pkgChar = event.getPackageName();
        if (pkgChar == null) return;
        String packageName = pkgChar.toString();

        if (!MONITORED_PACKAGES.contains(packageName)) return;

        // IMPORTANTE: Se estivermos em estado IDLE ou ainda a injetar o prompt,
        // NAO fazemos scraping do ecrã para evitar ler menus, gavetas ou UI antiga!
        if (currentState != ObserverState.WAITING_FOR_RESPONSE && currentState != ObserverState.STREAMING_RESPONSE) {
            return;
        }

        if (!packageName.equals(activePackageTarget)) return;

        AccessibilityNodeInfo rootNode = null;
        AccessibilityNodeInfo sourceNode = event.getSource();
        try {
            if (sourceNode != null && sourceNode.getWindow() != null) {
                rootNode = sourceNode.getWindow().getRoot();
            }
        } catch (Exception ignored) {
        } finally {
            if (sourceNode != null) sourceNode.recycle();
        }

        if (rootNode == null) {
            try {
                rootNode = getRootInActiveWindow();
            } catch (Exception ignored) {}
        }
        if (rootNode == null) return;

        try {
            boolean generating = isAIGenerating(rootNode);
            if (generating) {
                currentState = ObserverState.STREAMING_RESPONSE;
                updateOverlayStatus("A comunicar com " + resolveAppName(packageName), "A gerar resposta em direto...");
            }

            StringBuilder builder = new StringBuilder();
            traverseAndExtract(rootNode, builder, 0);
            String fullScreenText = builder.toString().trim();

            if (!fullScreenText.isEmpty()) {
                String cleanResponse = extractAssistantResponse(fullScreenText, activePromptMessage);

                if (!cleanResponse.isEmpty() && !cleanResponse.equals(lastStreamedText)) {
                    lastStreamedText = cleanResponse;
                    long now = System.currentTimeMillis();
                    lastScreenDispatchTime = now;

                    // Envia fragmento de streaming em tempo real para o GRIOT
                    GriotPlugin.dispatchStreamChunk(activeFixedThreadTitle, cleanResponse, false);

                    // Reinicia o detetor de estabilizacao
                    automationHandler.removeCallbacks(finishObservationRunnable);
                    long delay = generating ? 3500 : 1800;
                    automationHandler.postDelayed(finishObservationRunnable, delay);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao analisar AccessibilityNodeInfo", e);
        } finally {
            try {
                rootNode.recycle();
            } catch (Exception ignored) {}
        }
    }

    private boolean isAIGenerating(AccessibilityNodeInfo root) {
        if (root == null) return false;
        return searchStopButtonRecursive(root);
    }

    private boolean searchStopButtonRecursive(AccessibilityNodeInfo node) {
        if (node == null) return false;
        CharSequence desc = node.getContentDescription();
        CharSequence text = node.getText();
        String d = desc != null ? desc.toString().toLowerCase() : "";
        String t = text != null ? text.toString().toLowerCase() : "";
        String v = node.getViewIdResourceName() != null ? node.getViewIdResourceName().toLowerCase() : "";

        if (d.contains("parar") || d.contains("stop") || d.contains("interromper") ||
            t.contains("parar") || t.contains("stop") || v.contains("stop")) {
            return true;
        }

        int count = node.getChildCount();
        for (int i = 0; i < count; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                boolean found = searchStopButtonRecursive(child);
                try { child.recycle(); } catch (Exception ignored) {}
                if (found) return true;
            }
        }
        return false;
    }

    private void traverseAndExtract(AccessibilityNodeInfo node, StringBuilder builder, int depth) {
        if (node == null || depth > 45) return;

        CharSequence text = node.getText();
        if (text != null && text.length() > 0 && node.isVisibleToUser()) {
            builder.append(text.toString().trim()).append("\n");
        }

        CharSequence desc = node.getContentDescription();
        if (desc != null && desc.length() > 0 && (text == null || !desc.equals(text)) && node.isVisibleToUser()) {
            builder.append(desc.toString().trim()).append("\n");
        }

        int childCount = node.getChildCount();
        for (int i = 0; i < childCount; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                traverseAndExtract(child, builder, depth + 1);
                try {
                    child.recycle();
                } catch (Exception ignored) {}
            }
        }
    }

    /**
     * Extrai apenas a resposta da IA, eliminando prompts de utilizador, cabecalhos e botoes de UI.
     */
    private String extractAssistantResponse(String fullScreenText, String prompt) {
        if (fullScreenText == null || fullScreenText.isEmpty()) return "";

        String candidate = fullScreenText;

        // Se o prompt original for encontrado, a resposta vem depois do prompt
        if (prompt != null && !prompt.isEmpty()) {
            int promptIdx = candidate.lastIndexOf(prompt);
            if (promptIdx != -1) {
                candidate = candidate.substring(promptIdx + prompt.length()).trim();
            } else {
                String prefix = prompt.length() > 25 ? prompt.substring(0, 25) : prompt;
                int prefixIdx = candidate.lastIndexOf(prefix);
                if (prefixIdx != -1) {
                    candidate = candidate.substring(prefixIdx + prefix.length()).trim();
                }
            }
        }

        String[] lines = candidate.split("\n");
        StringBuilder sb = new StringBuilder();
        for (String line : lines) {
            String l = line.trim();
            if (l.isEmpty()) continue;
            String lower = l.toLowerCase();

            // Filtrar itens de menu, navegacao ou botoes de sistema
            if (lower.equals("fechar") || lower.equals("close") ||
                lower.equals("abrir menu") || lower.equals("menu") ||
                lower.equals("nova conversa") || lower.equals("novo chat") ||
                lower.equals("pesquisar") || lower.equals("search") ||
                lower.equals("chat") || lower.equals("definicoes da conta") ||
                lower.equals("recentes") || lower.startsWith("limpeza e preparacao") ||
                lower.equals("copiar") || lower.equals("copy") ||
                lower.equals("partilhar") || lower.equals("share") || lower.equals("compartilhar") ||
                lower.equals("regenerar") || lower.equals("regenerate") || lower.equals("tentar novamente") ||
                lower.equals("bom") || lower.equals("mau") || lower.equals("good response") || lower.equals("bad response") ||
                lower.equals("ler em voz alta") || lower.equals("read aloud") ||
                lower.equals("editar") || lower.equals("edit") ||
                lower.startsWith("escreva") || lower.startsWith("digite") || lower.startsWith("message") ||
                lower.startsWith("ask anything") || lower.startsWith("conversa com") ||
                lower.equals("chatgpt") || lower.equals("claude") || lower.equals("gemini") ||
                lower.equals("sonnet 5") || lower.equals("pensamento") || lower.equals("modo de voz") ||
                lower.equals("iniciar entrada de voz") || lower.equals("adicionar a conversa")) {
                continue;
            }

            sb.append(l).append("\n");
        }

        return sb.toString().trim();
    }

    public String resolveAppName(String pkg) {
        if (pkg.contains("chatgpt")) return "ChatGPT";
        if (pkg.contains("claude")) return "Claude";
        if (pkg.contains("gemini") || pkg.contains("bard")) return "Gemini";
        if (pkg.contains("deepseek")) return "DeepSeek";
        if (pkg.contains("kimi") || pkg.contains("moonshot")) return "Kimi";
        if (pkg.contains("grok")) return "Grok";
        if (pkg.contains("perplexity")) return "Perplexity";
        if (pkg.contains("mistral")) return "Le Chat";
        return "App de IA";
    }

    // =========================================================================
    // INJECAO AUTOMATIZADA
    // =========================================================================

    public boolean injectPromptToApp(String packageName, String fixedThreadTitle, String message) {
        this.activePackageTarget = packageName;
        this.activeFixedThreadTitle = fixedThreadTitle;
        this.activePromptMessage = message != null ? message.trim() : "";
        this.lastStreamedText = "";
        this.currentState = ObserverState.INJECTING;
        this.lastError = "";

        automationHandler.removeCallbacks(finishObservationRunnable);
        automationHandler.removeCallbacks(safetyReturnRunnable);

        if (!packageName.equals(getPackageName())) {
            try {
                Intent launchIntent = getPackageManager().getLaunchIntentForPackage(packageName);
                if (launchIntent == null) {
                    launchIntent = new Intent(Intent.ACTION_MAIN);
                    launchIntent.addCategory(Intent.CATEGORY_LAUNCHER);
                    launchIntent.setPackage(packageName);
                }

                if (getPackageManager().resolveActivity(launchIntent, 0) == null) {
                    this.lastError = "A aplicacao " + resolveAppName(packageName) + " nao esta instalada no teu dispositivo. Instala a app a partir da Google Play Store.";
                    Log.w(TAG, this.lastError);
                    dispatchAutomationResult(false, this.lastError);
                    currentState = ObserverState.IDLE;
                    return false;
                }

                // Exibe imediatamente o Overlay visual para cobrir a transicao
                showOverlay(resolveAppName(packageName));

                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NO_ANIMATION);
                startActivity(launchIntent);

                automationHandler.postDelayed(() -> attemptInjectionWithRetries(message, 1), 700);
                return true;
            } catch (Exception e) {
                hideOverlay();
                this.lastError = "Erro ao iniciar a app " + resolveAppName(packageName) + ": " + e.getMessage();
                Log.e(TAG, "Falha ao iniciar app alvo " + packageName, e);
                dispatchAutomationResult(false, this.lastError);
                currentState = ObserverState.IDLE;
                return false;
            }
        }

        return false;
    }

    private void attemptInjectionWithRetries(final String message, final int attempt) {
        if (attempt > 16) {
            Log.w(TAG, "Tempo limite excedido ao procurar campo de entrada em " + activePackageTarget);
            dispatchAutomationResult(false, "Nao foi possivel encontrar a caixa de texto em " + resolveAppName(activePackageTarget));
            cancelAndReturnToGriot();
            return;
        }

        AccessibilityNodeInfo tempRoot = null;
        try {
            tempRoot = getRootInActiveWindow();
        } catch (Exception ignored) {}
        final AccessibilityNodeInfo rootNode = tempRoot;

        if (rootNode == null) {
            automationHandler.postDelayed(() -> attemptInjectionWithRetries(message, attempt + 1), 350);
            return;
        }

        CharSequence rootPkg = rootNode.getPackageName();
        if (rootPkg != null && rootPkg.toString().equals(getPackageName())) {
            try { rootNode.recycle(); } catch (Exception ignored) {}
            automationHandler.postDelayed(() -> attemptInjectionWithRetries(message, attempt + 1), 350);
            return;
        }

        // 1. FECHAR GAVETA / MENU LATERAL SE ESTIVER ABERTO
        AccessibilityNodeInfo closeBtn = findCloseOrDrawerButton(rootNode);
        if (closeBtn != null) {
            Log.i(TAG, "Menu lateral/gaveta detetado aberto. A fechar...");
            closeBtn.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            try { closeBtn.recycle(); } catch (Exception ignored) {}
            try { rootNode.recycle(); } catch (Exception ignored) {}
            automationHandler.postDelayed(() -> attemptInjectionWithRetries(message, attempt + 1), 400);
            return;
        }

        // 2. ENCONTRAR O CAMPO DE CHAT REAL
        final AccessibilityNodeInfo inputNode = findChatInputNode(rootNode);
        if (inputNode == null) {
            try { rootNode.recycle(); } catch (Exception ignored) {}
            automationHandler.postDelayed(() -> attemptInjectionWithRetries(message, attempt + 1), 350);
            return;
        }

        try {
            updateOverlayStatus("A comunicar com " + resolveAppName(activePackageTarget), "A introduzir mensagem...");

            // Clicar e Focar
            inputNode.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            inputNode.performAction(AccessibilityNodeInfo.ACTION_FOCUS);

            automationHandler.postDelayed(() -> {
                try {
                    // Definir texto via ACTION_SET_TEXT
                    Bundle arguments = new Bundle();
                    arguments.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, message);
                    boolean textSet = inputNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments);

                    // Ajustar posicao do cursor para o final
                    try {
                        Bundle selArgs = new Bundle();
                        selArgs.putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, message.length());
                        selArgs.putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, message.length());
                        inputNode.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, selArgs);
                    } catch (Exception ignored) {}

                    // Fallback de Colagem caso ACTION_SET_TEXT nao atualize o estado Compose
                    if (!textSet) {
                        try {
                            ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                            if (clipboard != null) {
                                clipboard.setPrimaryClip(ClipData.newPlainText("griot_prompt", message));
                                inputNode.performAction(AccessibilityNodeInfo.ACTION_PASTE);
                            }
                        } catch (Exception clipEx) {
                            Log.w(TAG, "Falha no fallback de colagem:", clipEx);
                        }
                    }

                    // Clicar no botao Enviar
                    automationHandler.postDelayed(() -> clickSendAndObserve(rootNode, inputNode), 300);
                } catch (Exception ex) {
                    Log.e(TAG, "Erro na atribuicao de texto", ex);
                    try { rootNode.recycle(); } catch (Exception ignored) {}
                    try { inputNode.recycle(); } catch (Exception ignored) {}
                }
            }, 150);

        } catch (Exception e) {
            Log.e(TAG, "Erro na automacao do prompt", e);
            dispatchAutomationResult(false, e.getMessage() == null ? "Erro de automacao." : e.getMessage());
            cancelAndReturnToGriot();
            try { rootNode.recycle(); } catch (Exception ignored) {}
            try { inputNode.recycle(); } catch (Exception ignored) {}
        }
    }

    private AccessibilityNodeInfo findCloseOrDrawerButton(AccessibilityNodeInfo node) {
        if (node == null) return null;

        CharSequence text = node.getText();
        CharSequence desc = node.getContentDescription();
        String t = text != null ? text.toString().toLowerCase() : "";
        String d = desc != null ? desc.toString().toLowerCase() : "";

        if (node.isClickable() &&
            (t.equals("fechar") || t.equals("close") ||
             d.contains("fechar") || d.contains("close") || d.contains("navegar para cima") || d.contains("navigate up"))) {
            return node;
        }

        int count = node.getChildCount();
        for (int i = 0; i < count; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                AccessibilityNodeInfo res = findCloseOrDrawerButton(child);
                if (res != null) return res;
                try { child.recycle(); } catch (Exception ignored) {}
            }
        }
        return null;
    }

    private AccessibilityNodeInfo findChatInputNode(AccessibilityNodeInfo node) {
        if (node == null) return null;

        CharSequence desc = node.getContentDescription();
        CharSequence hint = node.getHintText();
        String d = desc != null ? desc.toString().toLowerCase() : "";
        String h = hint != null ? hint.toString().toLowerCase() : "";
        String v = node.getViewIdResourceName() != null ? node.getViewIdResourceName().toLowerCase() : "";

        // REJEITAR expressamente campos de pesquisa
        if (d.contains("pesquisar") || d.contains("search") ||
            h.contains("pesquisar") || h.contains("search") ||
            v.contains("search") || v.contains("pesquisa")) {
            return null;
        }

        if (node.isEditable()) {
            return node;
        }

        CharSequence className = node.getClassName();
        if (className != null && className.toString().contains("EditText")) {
            return node;
        }

        // Nos Jetpack Compose / React Native
        if ((node.isFocusable() || node.isClickable()) &&
            (d.contains("message") || d.contains("prompt") || d.contains("mensagem") || d.contains("ask") ||
             d.contains("escreva") || d.contains("digite") || d.contains("conversa") ||
             h.contains("message") || h.contains("mensagem") || h.contains("ask") || h.contains("escreva") ||
             v.contains("input") || v.contains("edit_text") || v.contains("chat_input"))) {
            return node;
        }

        int childCount = node.getChildCount();
        for (int i = 0; i < childCount; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                AccessibilityNodeInfo res = findChatInputNode(child);
                if (res != null) return res;
                try { child.recycle(); } catch (Exception ignored) {}
            }
        }
        return null;
    }

    private void clickSendAndObserve(AccessibilityNodeInfo root, AccessibilityNodeInfo inputNode) {
        boolean sent = false;
        try {
            AccessibilityNodeInfo sendButton = findSendButton(root, inputNode);
            if (sendButton != null) {
                sent = sendButton.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                try { sendButton.recycle(); } catch (Exception ignored) {}
            }

            if (!sent && inputNode != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    try {
                        sent = inputNode.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId());
                    } catch (Exception ignored) {}
                }
            }

            if (sent) {
                Log.i(TAG, "Prompt enviado com sucesso para " + activePackageTarget);
                updateOverlayStatus("A comunicar com " + resolveAppName(activePackageTarget), "Mensagem enviada. A aguardar resposta...");
                currentState = ObserverState.WAITING_FOR_RESPONSE;
                // Temporizador de seguranca de 60 segundos
                automationHandler.postDelayed(safetyReturnRunnable, 60000);
            } else {
                Log.w(TAG, "Botao Enviar nao encontrado em " + activePackageTarget);
                dispatchAutomationResult(false, "Botao Enviar nao encontrado em " + resolveAppName(activePackageTarget));
                cancelAndReturnToGriot();
            }
        } finally {
            try { if (root != null) root.recycle(); } catch (Exception ignored) {}
            try { if (inputNode != null) inputNode.recycle(); } catch (Exception ignored) {}
        }
    }

    private AccessibilityNodeInfo findSendButton(AccessibilityNodeInfo root, AccessibilityNodeInfo inputNode) {
        if (inputNode != null) {
            AccessibilityNodeInfo parent = inputNode.getParent();
            if (parent != null) {
                int count = parent.getChildCount();
                for (int i = 0; i < count; i++) {
                    AccessibilityNodeInfo sibling = parent.getChild(i);
                    if (sibling != null && !sibling.equals(inputNode)) {
                        if (sibling.isClickable() || sibling.isEnabled()) {
                            CharSequence desc = sibling.getContentDescription();
                            CharSequence txt = sibling.getText();
                            String d = desc != null ? desc.toString().toLowerCase() : "";
                            String t = txt != null ? txt.toString().toLowerCase() : "";
                            String v = sibling.getViewIdResourceName() != null ? sibling.getViewIdResourceName().toLowerCase() : "";
                            if (d.contains("send") || d.contains("enviar") || d.contains("prompt") || d.contains("arrow") ||
                                d.contains("submit") || d.contains("发送") || d.contains("paperplane") ||
                                t.contains("send") || t.contains("enviar") ||
                                v.contains("send") || v.contains("submit") || v.contains("btn")) {
                                return sibling;
                            }
                        }
                    }
                }
            }
        }

        return searchSendButtonRecursive(root);
    }

    private AccessibilityNodeInfo searchSendButtonRecursive(AccessibilityNodeInfo node) {
        if (node == null) return null;
        if (node.isClickable()) {
            CharSequence desc = node.getContentDescription();
            CharSequence text = node.getText();
            String descStr = desc != null ? desc.toString().toLowerCase() : "";
            String textStr = text != null ? text.toString().toLowerCase() : "";
            String viewId = node.getViewIdResourceName() != null ? node.getViewIdResourceName().toLowerCase() : "";

            if (descStr.contains("send") || descStr.contains("enviar") || descStr.contains("prompt") ||
                descStr.contains("arrow") || descStr.contains("submit") || descStr.contains("发送") ||
                descStr.contains("paperplane") ||
                textStr.contains("send") || textStr.contains("enviar") ||
                viewId.contains("send") || viewId.contains("submit") || viewId.contains("btn")) {
                return node;
            }
        }
        int childCount = node.getChildCount();
        for (int i = 0; i < childCount; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                AccessibilityNodeInfo res = searchSendButtonRecursive(child);
                if (res != null) return res;
                try { child.recycle(); } catch (Exception ignored) {}
            }
        }
        return null;
    }

    public void returnToGriot() {
        automationHandler.removeCallbacks(safetyReturnRunnable);
        automationHandler.removeCallbacks(finishObservationRunnable);
        try {
            Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                startActivity(intent);
            }
        } catch (Exception e) {
            Log.w(TAG, "Nao foi possivel trazer o GRIOT para a frente.", e);
        }
    }

    private void dispatchAutomationResult(boolean success, String message) {
        GriotPlugin.dispatchAutomationResult(activePackageTarget, activeFixedThreadTitle, success, message);
    }

    @Override
    public void onInterrupt() {
        Log.w(TAG, "GriotObserverService interrompido pelo sistema.");
        hideOverlay();
        currentState = ObserverState.IDLE;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        hideOverlay();
        currentState = ObserverState.IDLE;
    }
}
