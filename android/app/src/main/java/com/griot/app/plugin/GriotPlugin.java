package com.griot.app.plugin;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import android.text.TextUtils;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.griot.app.notifications.GriotNotificationHelper;
import com.griot.app.observer.GriotObserverService;

@CapacitorPlugin(
    name = "GriotObserverPlugin",
    permissions = {
        @Permission(strings = {Manifest.permission.CAMERA}, alias = "camera"),
        @Permission(strings = {Manifest.permission.RECORD_AUDIO}, alias = "microphone"),
        @Permission(strings = {Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, alias = "location"),
        @Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "notifications"),
        @Permission(strings = {Manifest.permission.READ_CONTACTS}, alias = "contacts"),
        @Permission(strings = {Manifest.permission.READ_CALENDAR}, alias = "calendar")
    }
)
public class GriotPlugin extends Plugin {

    private static GriotPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
        GriotNotificationHelper.initChannels(getContext());
    }

    public static GriotPlugin getInstance() {
        return instance;
    }

    public static void dispatchObserverEvent(String pkg, String appName, String content) {
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("package", pkg);
            data.put("appName", appName);
            data.put("content", content);
            data.put("timestamp", System.currentTimeMillis());
            instance.notifyListeners("onObserverEvent", data);
        }
    }

    public static void dispatchApprovalAction(String actionId, boolean approved) {
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("actionId", actionId);
            data.put("approved", approved);
            data.put("timestamp", System.currentTimeMillis());
            instance.notifyListeners("onApprovalAction", data);
        }
    }

    public static void dispatchAutomationResult(String packageName, String threadTitle, boolean success, String message) {
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("package", packageName);
            data.put("threadTitle", threadTitle);
            data.put("success", success);
            data.put("message", message);
            data.put("timestamp", System.currentTimeMillis());
            instance.notifyListeners("onAppAutomationResult", data);
        }
    }

    public static void dispatchStreamChunk(String threadTitle, String text, boolean isDone) {
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("threadTitle", threadTitle);
            data.put("text", text);
            data.put("isDone", isDone);
            data.put("timestamp", System.currentTimeMillis());
            instance.notifyListeners("onAppStreamChunk", data);
        }
    }

    @PluginMethod
    public void sendAppMessage(PluginCall call) {
        String packageName = call.getString("package", "com.openai.chatgpt");
        String threadTitle = call.getString("threadTitle", "[GRIOT] Chat");
        String message = call.getString("message", "");

        GriotObserverService service = GriotObserverService.getInstance();

        // Se a instância for null, mas estiver ativada nas definições, aguardar até 1s para o Android vincular
        if (service == null) {
            Context context = getContext();
            boolean isSettingsEnabled = false;
            try {
                String setting = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
                isSettingsEnabled = !TextUtils.isEmpty(setting) && setting.contains(context.getPackageName());
            } catch (Exception ignored) {}

            if (isSettingsEnabled) {
                for (int i = 0; i < 10; i++) {
                    try {
                        Thread.sleep(100);
                    } catch (InterruptedException ignored) {}
                    service = GriotObserverService.getInstance();
                    if (service != null) break;
                }
            }
        }

        if (service != null) {
            boolean queued = service.injectPromptToApp(packageName, threadTitle, message);
            JSObject ret = new JSObject();
            ret.put("success", queued);
            ret.put("queued", queued);
            ret.put("injected", false);
            ret.put("threadTitle", threadTitle);
            if (!queued) {
                String err = service.getLastError();
                ret.put("error", (err != null && !err.isEmpty()) ? err : "Não foi possível abrir ou comunicar com " + packageName);
            }
            call.resolve(ret);
        } else {
            Context context = getContext();
            boolean isSettingsEnabled = false;
            try {
                String setting = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
                isSettingsEnabled = !TextUtils.isEmpty(setting) && setting.contains(context.getPackageName());
            } catch (Exception ignored) {}

            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("injected", false);
            if (isSettingsEnabled) {
                ret.put("error", "O GRIOT Observer está ativado nas definições mas o serviço Android ainda está a ligar. Tenta enviar novamente em instantes.");
            } else {
                ret.put("error", "Verifica se o GRIOT Observer está ativado em Acessibilidade.");
            }
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void isAppInstalled(PluginCall call) {
        String packageName = call.getString("package", "");
        boolean installed = false;
        if (!TextUtils.isEmpty(packageName)) {
            try {
                getContext().getPackageManager().getPackageInfo(packageName, 0);
                installed = true;
            } catch (Exception e) {
                Intent intent = getContext().getPackageManager().getLaunchIntentForPackage(packageName);
                installed = intent != null;
            }
        }
        JSObject ret = new JSObject();
        ret.put("installed", installed);
        call.resolve(ret);
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Falha ao abrir definições de acessibilidade: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openNotificationListenerSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Falha ao abrir definições de notificações: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isAccessibilityServiceEnabled(PluginCall call) {
        Context context = getContext();
        String expectedServiceName = context.getPackageName() + "/" + GriotObserverService.class.getName();
        boolean isEnabled = false;

        try {
            String enabledServicesSetting = Settings.Secure.getString(
                context.getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            );

            if (!TextUtils.isEmpty(enabledServicesSetting)) {
                TextUtils.SimpleStringSplitter colonSplitter = new TextUtils.SimpleStringSplitter(':');
                colonSplitter.setString(enabledServicesSetting);
                while (colonSplitter.hasNext()) {
                    String componentNameString = colonSplitter.next();
                    if (componentNameString.equalsIgnoreCase(expectedServiceName) ||
                        componentNameString.contains(context.getPackageName())) {
                        isEnabled = true;
                        break;
                    }
                }
            }
        } catch (Exception ignored) {}

        JSObject ret = new JSObject();
        ret.put("enabled", isEnabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void isNotificationListenerEnabled(PluginCall call) {
        Context context = getContext();
        boolean isEnabled = NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.getPackageName());
        JSObject ret = new JSObject();
        ret.put("enabled", isEnabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void sendNativeNotification(PluginCall call) {
        String type = call.getString("type", "message");
        String title = call.getString("title", "GRIOT");
        String message = call.getString("message", "");
        String actionId = call.getString("actionId", "act_" + System.currentTimeMillis());
        String url = call.getString("url", "https://griot.ai");

        Context context = getContext();

        switch (type) {
            case "approval":
                GriotNotificationHelper.showApprovalNotification(context, actionId, title, message);
                break;
            case "deploy":
                GriotNotificationHelper.showDeployNotification(context, title, url);
                break;
            case "task":
                GriotNotificationHelper.showTaskCompletedNotification(context, title, message);
                break;
            case "message":
            default:
                GriotNotificationHelper.showMessageNotification(context, title, message);
                break;
        }

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void checkPermissionsStatus(PluginCall call) {
        Context context = getContext();
        JSObject ret = new JSObject();

        ret.put("camera", ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED);
        ret.put("microphone", ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED);
        ret.put("location", ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED);
        ret.put("contacts", ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED);
        ret.put("calendar", ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ret.put("notifications", ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);
        } else {
            ret.put("notifications", NotificationManagerCompat.from(context).areNotificationsEnabled());
        }

        // Acessibilidade
        String expectedServiceName = context.getPackageName() + "/" + GriotObserverService.class.getName();
        boolean accEnabled = false;
        try {
            String setting = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            accEnabled = !TextUtils.isEmpty(setting) && setting.contains(context.getPackageName());
        } catch (Exception ignored) {}
        ret.put("accessibility", accEnabled);

        boolean notifListener = NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.getPackageName());
        ret.put("notificationListener", notifListener);

        call.resolve(ret);
    }

    @PluginMethod
    public void requestAllPermissions(PluginCall call) {
        requestAllPermissionsInternal(call);
    }

    private void requestAllPermissionsInternal(PluginCall call) {
        requestPermissionForAliases(
            new String[]{"camera", "microphone", "location", "notifications", "contacts", "calendar"},
            call,
            "permissionsCallback"
        );
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        checkPermissionsStatus(call);
    }
}
