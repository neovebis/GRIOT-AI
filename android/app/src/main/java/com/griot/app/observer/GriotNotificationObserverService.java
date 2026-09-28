package com.griot.app.observer;

import android.app.Notification;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import com.griot.app.plugin.GriotPlugin;

/**
 * GriotNotificationObserverService
 * NotificationListenerService do Android que captura notificações de término de raciocínio,
 * streaming em segundo plano e conclusões das 8 apps de IA monitoradas.
 */
public class GriotNotificationObserverService extends NotificationListenerService {

    private static final String TAG = "GriotNotifObserver";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        String pkg = sbn.getPackageName();
        if (pkg == null) return;

        if (GriotObserverService.MONITORED_PACKAGES.contains(pkg)) {
            Notification notification = sbn.getNotification();
            if (notification == null) return;
            Bundle extras = notification.extras;
            if (extras == null) return;

            CharSequence titleChar = extras.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence textChar = extras.getCharSequence(Notification.EXTRA_TEXT);
            String title = titleChar != null ? titleChar.toString() : "";
            String text = textChar != null ? textChar.toString() : "";
            String fullNotif = (title + " - " + text).trim();

            if (!fullNotif.isEmpty()) {
                Log.d(TAG, "Notificação de IA recebida de " + pkg + ": " + fullNotif);

                GriotPlugin.dispatchObserverEvent(pkg, pkg, fullNotif);

                Intent intent = new Intent(GriotObserverService.ACTION_GRIOT_EVENT);
                intent.putExtra("extra_package", pkg);
                intent.putExtra("extra_app_name", pkg);
                intent.putExtra("extra_content", fullNotif);
                intent.putExtra("extra_timestamp", System.currentTimeMillis());
                intent.putExtra("is_notification", true);
                sendBroadcast(intent);
            }
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // Sem necessidade de ação
    }
}
