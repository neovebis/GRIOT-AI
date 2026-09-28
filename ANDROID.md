# GRIOT — App Nativa (Android / iOS via Capacitor & GitHub Actions)

O projeto está pronto para gerar a aplicação nativa Android (`.apk` e `.aab` para a Play Store) e iOS através do Capacitor.

---

## 🚀 Build Automática no GitHub Actions (Sem instalar nada no PC)

O projeto já inclui o workflow configurado em `.github/workflows/android.yml`.

### Como gerar o seu APK pelo GitHub:

1. **Faça Push/Export do projeto para o seu repositório GitHub.**
2. No seu repositório no GitHub, clique na aba **Actions**.
3. Na barra lateral esquerda, selecione o fluxo **"Android App (APK/AAB)"**.
4. Clique em **"Run workflow"** e selecione a branch `main` (ou simplesmente faça qualquer novo `push` para a branch `main`).
5. Quando o workflow terminar (ícone verde de sucesso ✅):
   - Clique na execução concluída.
   - Na seção **Artifacts** no final da página, baixe:
     - **`griot-debug-apk`**: Ficheiro `.apk` pronto para instalar diretamente no seu telemóvel Android.
     - **`griot-release-apk`**: Ficheiro `.apk` assinado de produção.
     - **`griot-release-aab`**: Pacote `.aab` para publicação na Google Play Store.

---

## 🔑 Configurar Assinatura de Produção (Keystore no GitHub Secrets)

Para gerar builds de produção assinadas automaticamente no GitHub Actions:

1. **Gere a sua Keystore no seu terminal (caso ainda não tenha uma):**
   ```bash
   keytool -genkey -v -keystore griot-release.keystore -alias griot-key -keyalg RSA -keysize 2048 -validity 10000
   ```
2. **Converta a keystore para Base64:**
   ```bash
   base64 -w 0 griot-release.keystore > keystore-base64.txt
   # No macOS: base64 -i griot-release.keystore -o keystore-base64.txt
   ```
3. **Adicione os Secrets no seu repositório GitHub (`Settings -> Secrets and variables -> Actions`):**
   - `KEYSTORE_BASE64`: Conteúdo do ficheiro `keystore-base64.txt`
   - `KEYSTORE_PASSWORD`: Senha que definiu para a keystore
   - `KEY_ALIAS`: `griot-key` (ou o alias que escolheu)
   - `KEY_PASSWORD`: Senha que definiu para a chave

---

## 🤖 Build exclusivamente via GitHub Actions

O fluxo suportado para este projeto é o GitHub Actions. Não é necessário Android Studio nem SDK instalado no computador local.

Em **Actions → GRIOT Mobile Android → Run workflow**, execute na branch desejada. O workflow:

```text
npm install
→ npm run lint
→ npm run build
→ valida integração nativa
→ npx cap sync android
→ ./gradlew assembleDebug
→ upload do APK
```

O APK aparece no final da execução em **Artifacts → `griot-mobile-debug-apk`**.
