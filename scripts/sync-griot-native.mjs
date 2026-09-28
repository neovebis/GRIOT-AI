/**
 * Script de Sincronização e Validação do Código Nativo do GRIOT para Android
 * Garante que todos os Serviços de Acessibilidade, Notification Listeners,
 * Plugins e Permissões do AndroidManifest.xml estejam presentes antes da compilação do APK.
 */

import fs from "node:fs";
import path from "node:path";

const MANIFEST_PATH = path.resolve("android/app/src/main/AndroidManifest.xml");
const ACCESSIBILITY_CONFIG = path.resolve(
  "android/app/src/main/res/xml/accessibility_service_config.xml",
);
const JAVA_OBSERVER_SERVICE = path.resolve(
  "android/app/src/main/java/com/griot/app/observer/GriotObserverService.java",
);
const JAVA_NOTIF_SERVICE = path.resolve(
  "android/app/src/main/java/com/griot/app/observer/GriotNotificationObserverService.java",
);
const JAVA_PLUGIN = path.resolve("android/app/src/main/java/com/griot/app/plugin/GriotPlugin.java");
const JAVA_NOTIF_HELPER = path.resolve(
  "android/app/src/main/java/com/griot/app/notifications/GriotNotificationHelper.java",
);
const JAVA_ACTION_RECEIVER = path.resolve(
  "android/app/src/main/java/com/griot/app/notifications/GriotNotificationActionReceiver.java",
);

console.log("==> Verificando ficheiros nativos Android do GRIOT...");

const filesToCheck = [
  { name: "AndroidManifest.xml", path: MANIFEST_PATH },
  { name: "accessibility_service_config.xml", path: ACCESSIBILITY_CONFIG },
  { name: "GriotObserverService.java", path: JAVA_OBSERVER_SERVICE },
  { name: "GriotNotificationObserverService.java", path: JAVA_NOTIF_SERVICE },
  { name: "GriotPlugin.java", path: JAVA_PLUGIN },
  { name: "GriotNotificationHelper.java", path: JAVA_NOTIF_HELPER },
  { name: "GriotNotificationActionReceiver.java", path: JAVA_ACTION_RECEIVER },
];

let allOk = true;

for (const file of filesToCheck) {
  if (fs.existsSync(file.path)) {
    console.log(`  [OK] ${file.name} presente (${fs.statSync(file.path).size} bytes)`);
  } else {
    console.error(`  [ERRO] ${file.name} em falta em ${file.path}`);
    allOk = false;
  }
}

// Validar se AndroidManifest contém as tags de serviço e permissões
if (fs.existsSync(MANIFEST_PATH)) {
  const content = fs.readFileSync(MANIFEST_PATH, "utf8");
  const checks = [
    "GriotObserverService",
    "GriotNotificationObserverService",
    "GriotNotificationActionReceiver",
    "android.permission.CAMERA",
    "android.permission.RECORD_AUDIO",
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.ACCESS_FINE_LOCATION",
  ];

  console.log("==> Validando declarações no AndroidManifest.xml...");
  for (const check of checks) {
    if (content.includes(check)) {
      console.log(`  [OK] Declaração encontrada: ${check}`);
    } else {
      console.error(`  [ALERTA] Declaração em falta no Manifest: ${check}`);
      allOk = false;
    }
  }
}

if (!allOk) {
  console.error("Falha na validação nativa do Android!");
  process.exit(1);
} else {
  console.log("==> Todos os ficheiros e serviços nativos do Android estão validados com sucesso!");
}
