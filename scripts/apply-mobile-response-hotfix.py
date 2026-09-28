from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]

# 1. Ensure the completed assistant message is reconciled into React state
# after the execution manager returns and before the UI cleanup runs.
chat_path = ROOT / "src/components/griot/chat-surface.tsx"
chat = chat_path.read_text(encoding="utf-8")
anchor = '''      await chatExecutionManager.startExecution({
        conversationId: targetConvId,
        scope: targetScope,
        userId,
        modelId: model,
        messages: base,
        userPrompt: lastUserPrompt,
        effort: activeEffort,
        systemInstruction: sysInstruction,
        context,
        currentProject,
      });
      console.log("[GRIOT_DEBUG] startExecution terminou sem lançar erro");'''
replacement = '''      await chatExecutionManager.startExecution({
        conversationId: targetConvId,
        scope: targetScope,
        userId,
        modelId: model,
        messages: base,
        userPrompt: lastUserPrompt,
        effort: activeEffort,
        systemInstruction: sysInstruction,
        context,
        currentProject,
      });

      // Reconciliação pós-execução: a resposta já foi persistida pelo
      // execution manager; injeta-a explicitamente no estado React após
      // a conclusão da execução para evitar que o cleanup da animação
      // deixe o chat visualmente sem a resposta.
      if (typeof window !== "undefined" && targetConvId) {
        try {
          const rawFinal = localStorage.getItem("griot_messages_" + targetConvId);
          if (rawFinal) {
            const finalMessages = JSON.parse(rawFinal);
            if (Array.isArray(finalMessages)) {
              setMessages(finalMessages);
            }
          }
        } catch (reconcileErr) {
          console.warn("[GRIOT_DEBUG] reconciliação final de mensagens falhou:", reconcileErr);
        }
      }

      console.log("[GRIOT_DEBUG] startExecution terminou sem lançar erro");'''

if "Reconciliação pós-execução" not in chat:
    if anchor not in chat:
        raise SystemExit("chat-surface anchor not found")
    chat_path.write_text(chat.replace(anchor, replacement, 1), encoding="utf-8")

# 1b. Quick is the zero-thinking fast path: never render the Thinking animation.
quick_anchor = '''          {busy ? <Thinking text={reasoning} active={!streaming} steps={steps} /> : null}'''
quick_replacement = '''          {busy && scope !== "quick" ? <Thinking text={reasoning} active={!streaming} steps={steps} /> : null}'''
chat = chat_path.read_text(encoding="utf-8")
if quick_anchor in chat:
    chat_path.write_text(chat.replace(quick_anchor, quick_replacement, 1), encoding="utf-8")
elif quick_replacement not in chat:
    raise SystemExit("Thinking render anchor not found")

# 2. Keep package + Android version aligned for the next release.
pkg_path = ROOT / "package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
if pkg.get("version") == "1.0.39":
    pkg["version"] = "1.0.40"
    pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

gradle_path = ROOT / "android/app/build.gradle"
gradle = gradle_path.read_text(encoding="utf-8")
gradle = re.sub(r'(versionCode\s+)39\b', r'\g<1>40', gradle, count=1)
gradle = re.sub(r'(versionName\s+")1\.0\.39(\")', r'\g<1>1.0.40\g<2>', gradle, count=1)
gradle_path.write_text(gradle, encoding="utf-8")

# 3. Commit source changes so the repository and APK build are identical.
subprocess.run(["git", "diff", "--check"], cwd=ROOT, check=True)
status = subprocess.run(["git", "status", "--short"], cwd=ROOT, text=True, capture_output=True, check=True).stdout
if status.strip():
    subprocess.run(["git", "config", "user.name", "github-actions[bot]"], cwd=ROOT, check=True)
    subprocess.run(["git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], cwd=ROOT, check=True)
    subprocess.run(["git", "add", "src/components/griot/chat-surface.tsx", "package.json", "android/app/build.gradle"], cwd=ROOT, check=True)
    subprocess.run(["git", "commit", "-m", "fix(chat): reconcile completed assistant response"], cwd=ROOT, check=True)
    subprocess.run(["git", "push", "origin", "HEAD:main"], cwd=ROOT, check=True)
