package com.griot.app.notifications;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.griot.app.MainActivity;
import com.griot.app.R;

/**
 * Gestor Central de Notificações Nativas do GRIOT.
 * Cria canais e emite notificações de:
 * 1. Aprovações de Comandos (com botões Aprovar / Rejeitar)
 * 2. Mensagens de IA e Respostas do GRIOT Core
 * 3. Sites / Projetos Deployados (com botão Abrir URL)
 * 4. Tarefas Concluídas
 */
public class GriotNotificationHelper {

    public static final String CHANNEL_APPROVALS = "griot_approvals";
    public static final String CHANNEL_MESSAGES = "griot_messages";
    public static final String CHANNEL_DEPLOYS = "griot_deploys";
    public static final String CHANNEL_TASKS = "griot_tasks";

    public static final String ACTION_APPROVE = "com.griot.app.ACTION_APPROVE";
    public static final String ACTION_REJECT = "com.griot.app.ACTION_REJECT";
    public static final String EXTRA_ACTION_ID = "extra_action_id";
    public static final String EXTRA_NOTIFICATION_ID = "extra_notification_id";
    public static final String EXTRA_PAYLOAD = "extra_payload";

    public static void initChannels(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;

            // 1. Canal de Aprovações (High Importance com Som/Vibração)
            NotificationChannel approvalsChannel = new NotificationChannel(
                CHANNEL_APPROVALS,
                context.getString(R.string.channel_approvals_name),
                NotificationManager.IMPORTANCE_HIGH
            );
            approvalsChannel.setDescription(context.getString(R.string.channel_approvals_desc));
            approvalsChannel.enableVibration(true);
            approvalsChannel.setShowBadge(true);
            manager.createNotificationChannel(approvalsChannel);

            // 2. Canal de Mensagens
            NotificationChannel messagesChannel = new NotificationChannel(
                CHANNEL_MESSAGES,
                context.getString(R.string.channel_messages_name),
                NotificationManager.IMPORTANCE_DEFAULT
            );
            messagesChannel.setDescription(context.getString(R.string.channel_messages_desc));
            messagesChannel.setShowBadge(true);
            manager.createNotificationChannel(messagesChannel);

            // 3. Canal de Deploys
            NotificationChannel deploysChannel = new NotificationChannel(
                CHANNEL_DEPLOYS,
                context.getString(R.string.channel_deploys_name),
                NotificationManager.IMPORTANCE_HIGH
            );
            deploysChannel.setDescription(context.getString(R.string.channel_deploys_desc));
            deploysChannel.enableVibration(true);
            deploysChannel.setShowBadge(true);
            manager.createNotificationChannel(deploysChannel);

            // 4. Canal de Tarefas
            NotificationChannel tasksChannel = new NotificationChannel(
                CHANNEL_TASKS,
                context.getString(R.string.channel_tasks_name),
                NotificationManager.IMPORTANCE_DEFAULT
            );
            tasksChannel.setDescription(context.getString(R.string.channel_tasks_desc));
            tasksChannel.setShowBadge(true);
            manager.createNotificationChannel(tasksChannel);
        }
    }

    /**
     * Dispara notificação interativa com botões de "Aprovar" e "Rejeitar"
     */
    public static void showApprovalNotification(Context context, String actionId, String title, String commandDescription) {
        initChannels(context);
        int notifId = (int) (System.currentTimeMillis() % 100000);

        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        openAppIntent.putExtra("route", "/chat");
        PendingIntent openPendingIntent = PendingIntent.getActivity(
            context, notifId, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Ação: Aprovar
        Intent approveIntent = new Intent(context, GriotNotificationActionReceiver.class);
        approveIntent.setAction(ACTION_APPROVE);
        approveIntent.putExtra(EXTRA_ACTION_ID, actionId);
        approveIntent.putExtra(EXTRA_NOTIFICATION_ID, notifId);
        PendingIntent approvePending = PendingIntent.getBroadcast(
            context, notifId + 1, approveIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Ação: Rejeitar
        Intent rejectIntent = new Intent(context, GriotNotificationActionReceiver.class);
        rejectIntent.setAction(ACTION_REJECT);
        rejectIntent.putExtra(EXTRA_ACTION_ID, actionId);
        rejectIntent.putExtra(EXTRA_NOTIFICATION_ID, notifId);
        PendingIntent rejectPending = PendingIntent.getBroadcast(
            context, notifId + 2, rejectIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_APPROVALS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setLargeIcon(BitmapFactory.decodeResource(context.getResources(), R.mipmap.ic_launcher))
            .setContentTitle(title != null ? title : "Aprovação Requerida - GRIOT")
            .setContentText(commandDescription)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(commandDescription))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(openPendingIntent)
            .setAutoCancel(true)
            .addAction(android.R.drawable.ic_media_play, "Aprovar", approvePending)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Rejeitar", rejectPending);

        try {
            NotificationManagerCompat.from(context).notify(notifId, builder.build());
        } catch (SecurityException e) {
            // Permissão POST_NOTIFICATIONS pode não ter sido concedida ainda
        }
    }

    /**
     * Dispara notificação de nova mensagem de IA ou sistema
     */
    public static void showMessageNotification(Context context, String sender, String message) {
        initChannels(context);
        int notifId = (int) (System.currentTimeMillis() % 100000);

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        openIntent.putExtra("route", "/chat");
        PendingIntent pending = PendingIntent.getActivity(
            context, notifId, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setLargeIcon(BitmapFactory.decodeResource(context.getResources(), R.mipmap.ic_launcher))
            .setContentTitle(sender != null && !sender.isEmpty() ? sender : "GRIOT Core")
            .setContentText(message)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pending)
            .setAutoCancel(true);

        try {
            NotificationManagerCompat.from(context).notify(notifId, builder.build());
        } catch (SecurityException ignored) {}
    }

    /**
     * Dispara notificação de deploy concluído com botão de abrir o site
     */
    public static void showDeployNotification(Context context, String projectName, String deployUrl) {
        initChannels(context);
        int notifId = (int) (System.currentTimeMillis() % 100000);

        Intent openUrlIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(deployUrl));
        PendingIntent openUrlPending = PendingIntent.getActivity(
            context, notifId + 1, openUrlIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.putExtra("route", "/projects");
        PendingIntent openAppPending = PendingIntent.getActivity(
            context, notifId, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_DEPLOYS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setLargeIcon(BitmapFactory.decodeResource(context.getResources(), R.mipmap.ic_launcher))
            .setContentTitle("Site Deployado com Sucesso! 🚀")
            .setContentText(projectName + ": " + deployUrl)
            .setStyle(new NotificationCompat.BigTextStyle().bigText("O teu projeto " + projectName + " está no ar!\n" + deployUrl))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(openAppPending)
            .setAutoCancel(true)
            .addAction(android.R.drawable.ic_menu_view, "Abrir Site", openUrlPending);

        try {
            NotificationManagerCompat.from(context).notify(notifId, builder.build());
        } catch (SecurityException ignored) {}
    }

    /**
     * Dispara notificação de tarefa em segundo plano concluída
     */
    public static void showTaskCompletedNotification(Context context, String taskTitle, String resultSummary) {
        initChannels(context);
        int notifId = (int) (System.currentTimeMillis() % 100000);

        Intent openIntent = new Intent(context, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(
            context, notifId, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_TASKS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setLargeIcon(BitmapFactory.decodeResource(context.getResources(), R.mipmap.ic_launcher))
            .setContentTitle("Tarefa Concluída: " + taskTitle)
            .setContentText(resultSummary)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(resultSummary))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pending)
            .setAutoCancel(true);

        try {
            NotificationManagerCompat.from(context).notify(notifId, builder.build());
        } catch (SecurityException ignored) {}
    }
}
