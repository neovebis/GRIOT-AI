package com.griot.app.notifications;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import androidx.core.app.NotificationManagerCompat;
import com.griot.app.plugin.GriotPlugin;

/**
 * Receptor de Ações das Notificações Nativas do GRIOT.
 * Escuta cliques nos botões "Aprovar" e "Rejeitar".
 */
public class GriotNotificationActionReceiver extends BroadcastReceiver {

    private static final String TAG = "GriotNotifReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String actionId = intent.getStringExtra(GriotNotificationHelper.EXTRA_ACTION_ID);
        int notifId = intent.getIntExtra(GriotNotificationHelper.EXTRA_NOTIFICATION_ID, -1);

        Log.i(TAG, "Ação recebida da notificação: " + action + " | ActionID: " + actionId);

        if (notifId != -1) {
            NotificationManagerCompat.from(context).cancel(notifId);
        }

        boolean approved = GriotNotificationHelper.ACTION_APPROVE.equals(action);

        // Notificar o Plugin do Capacitor / Frontend em tempo real
        GriotPlugin.dispatchApprovalAction(actionId, approved);

        // Enviar broadcast local para qualquer outro componente
        Intent localBroadcast = new Intent("com.griot.app.ACTION_APPROVAL_RESPONSE");
        localBroadcast.putExtra("action_id", actionId);
        localBroadcast.putExtra("approved", approved);
        context.sendBroadcast(localBroadcast);
    }
}
