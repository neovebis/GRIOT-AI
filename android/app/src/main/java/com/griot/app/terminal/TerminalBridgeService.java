package com.griot.app.terminal;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import com.griot.app.R;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileDescriptor;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * TerminalBridgeService:
 * Manages the Linux PRoot / Termux ARM64 environment lifecycle, foreground execution,
 * PTY file descriptors, and prevents Android Phantom Process Killer from terminating tasks.
 */
public class TerminalBridgeService extends Service {

    private static final String TAG = "TerminalBridgeService";
    private static final String CHANNEL_ID = "griot_terminal_service_channel";
    private static final int NOTIFICATION_ID = 2401;

    public interface TerminalOutputListener {
        void onOutput(String sessionId, String chunk);
        void onExit(String sessionId, int exitCode);
    }

    public static class SessionHolder {
        public final String id;
        public final int pid;
        public final int masterFd;
        public final OutputStream outputStream;
        public final Process process; // non-null if fallback used

        public SessionHolder(String id, int pid, int masterFd, OutputStream outputStream, Process process) {
            this.id = id;
            this.pid = pid;
            this.masterFd = masterFd;
            this.outputStream = outputStream;
            this.process = process;
        }
    }

    private final IBinder binder = new LocalBinder();
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Map<String, SessionHolder> activeSessions = new ConcurrentHashMap<>();
    private TerminalOutputListener globalListener;

    public class LocalBinder extends Binder {
        public TerminalBridgeService getService() {
            return TerminalBridgeService.this;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildForegroundNotification("Terminal Nativo ARM64 Ativo", "Ambiente PRoot inicializado"));
        bootstrapEnvironment();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    public void setListener(TerminalOutputListener listener) {
        this.globalListener = listener;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "GRIOT Runtime Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Mantém processos de compilação, Git e Terminal ativos");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildForegroundNotification(String title, String content) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(content)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    /**
     * Prepares directories and PRoot environment rootfs
     */
    public void bootstrapEnvironment() {
        try {
            File filesDir = getFilesDir();
            File usrDir = new File(filesDir, "usr");
            File binDir = new File(usrDir, "bin");
            File etcDir = new File(usrDir, "etc");
            File homeDir = new File(filesDir, "home");
            File wsDir = new File(homeDir, "workspace");

            if (!binDir.exists()) binDir.mkdirs();
            if (!etcDir.exists()) etcDir.mkdirs();
            if (!wsDir.exists()) wsDir.mkdirs();

            // Set up environment config
            File envFile = new File(etcDir, "griot_env.sh");
            if (!envFile.exists()) {
                String envContent = "#!/bin/sh\n"
                        + "export HOME=" + homeDir.getAbsolutePath() + "\n"
                        + "export PREFIX=" + usrDir.getAbsolutePath() + "\n"
                        + "export PATH=" + binDir.getAbsolutePath() + ":/system/bin:/system/xbin\n"
                        + "export TERM=xterm-256color\n"
                        + "export LANG=en_US.UTF-8\n"
                        + "export GRADLE_OPTS=\"-Xmx1024m -XX:+UseG1GC\"\n"
                        + "cd " + wsDir.getAbsolutePath() + "\n";
                FileOutputStream fos = new FileOutputStream(envFile);
                fos.write(envContent.getBytes());
                fos.close();
                envFile.setExecutable(true);
            }
            Log.i(TAG, "Bootstrap completed at: " + usrDir.getAbsolutePath());
        } catch (Exception e) {
            Log.e(TAG, "Error in bootstrapEnvironment: " + e.getMessage());
        }
    }

    public File getWorkspaceDir() {
        File home = new File(getFilesDir(), "home");
        File ws = new File(home, "workspace");
        if (!ws.exists()) ws.mkdirs();
        return ws;
    }

    public File getUsrDir() {
        File usr = new File(getFilesDir(), "usr");
        if (!usr.exists()) usr.mkdirs();
        return usr;
    }

    /**
     * Opens a PTY terminal session with full bidirectionality and process supervision
     */
    public synchronized boolean openSession(String sessionId, String command, int rows, int cols) {
        if (activeSessions.containsKey(sessionId)) {
            return true;
        }

        File ws = getWorkspaceDir();
        File usr = getUsrDir();

        // 1. Try JNI forkpty
        if (TerminalJni.isAvailable()) {
            try {
                int[] pids = new int[1];
                String[] envp = new String[]{
                        "HOME=" + new File(getFilesDir(), "home").getAbsolutePath(),
                        "PREFIX=" + usr.getAbsolutePath(),
                        "PATH=" + usr.getAbsolutePath() + "/bin:/system/bin:/system/xbin",
                        "TERM=xterm-256color",
                        "LANG=en_US.UTF-8",
                        "GRADLE_OPTS=-Xmx1024m -XX:+UseG1GC"
                };

                int fd = TerminalJni.createSubprocess(
                        (command != null && !command.isEmpty()) ? command : "/system/bin/sh",
                        ws.getAbsolutePath(),
                        envp,
                        pids,
                        rows,
                        cols
                );

                if (fd >= 0) {
                    FileDescriptor fileDescriptor = createFdObject(fd);
                    FileInputStream fis = new FileInputStream(fileDescriptor);
                    FileOutputStream fos = new FileOutputStream(fileDescriptor);

                    SessionHolder holder = new SessionHolder(sessionId, pids[0], fd, fos, null);
                    activeSessions.put(sessionId, holder);

                    // Read loop
                    executor.execute(() -> {
                        byte[] buffer = new byte[2048];
                        try {
                            int read;
                            while ((read = fis.read(buffer)) > 0) {
                                String chunk = new String(buffer, 0, read);
                                if (globalListener != null) {
                                    globalListener.onOutput(sessionId, chunk);
                                }
                            }
                        } catch (Exception ignored) {
                        } finally {
                            int exitCode = TerminalJni.waitForProcess(pids[0]);
                            TerminalJni.closeFd(fd);
                            activeSessions.remove(sessionId);
                            if (globalListener != null) {
                                globalListener.onExit(sessionId, exitCode);
                            }
                        }
                    });

                    return true;
                }
            } catch (Throwable t) {
                Log.w(TAG, "JNI forkpty invocation failed, falling back to ProcessBuilder: " + t.getMessage());
            }
        }

        // 2. Fallback to robust ProcessBuilder
        try {
            ProcessBuilder pb = new ProcessBuilder(
                    "/system/bin/sh",
                    "-c",
                    (command != null && !command.isEmpty()) ? command : "/system/bin/sh"
            );
            pb.directory(ws);
            Map<String, String> env = pb.environment();
            env.put("HOME", new File(getFilesDir(), "home").getAbsolutePath());
            env.put("PREFIX", usr.getAbsolutePath());
            env.put("PATH", usr.getAbsolutePath() + "/bin:/system/bin:/system/xbin");
            env.put("TERM", "xterm-256color");
            env.put("LANG", "en_US.UTF-8");
            env.put("GRADLE_OPTS", "-Xmx1024m -XX:+UseG1GC");

            Process process = pb.start();
            SessionHolder holder = new SessionHolder(sessionId, -1, -1, process.getOutputStream(), process);
            activeSessions.put(sessionId, holder);

            executor.execute(() -> {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                    char[] buf = new char[1024];
                    int read;
                    while ((read = reader.read(buf, 0, buf.length)) != -1) {
                        String chunk = new String(buf, 0, read);
                        if (globalListener != null) {
                            globalListener.onOutput(sessionId, chunk);
                        }
                    }
                } catch (Exception ignored) {
                } finally {
                    int exitCode = 0;
                    try {
                        exitCode = process.waitFor();
                    } catch (Exception ignored) {}
                    activeSessions.remove(sessionId);
                    if (globalListener != null) {
                        globalListener.onExit(sessionId, exitCode);
                    }
                }
            });

            return true;
        } catch (Exception e) {
            Log.e(TAG, "ProcessBuilder failed: " + e.getMessage());
            return false;
        }
    }

    public boolean sendInput(String sessionId, String input) {
        SessionHolder holder = activeSessions.get(sessionId);
        if (holder != null && holder.outputStream != null) {
            try {
                holder.outputStream.write(input.getBytes());
                holder.outputStream.flush();
                return true;
            } catch (Exception e) {
                Log.e(TAG, "Error writing to session: " + e.getMessage());
            }
        }
        return false;
    }

    public void resizePty(String sessionId, int rows, int cols) {
        SessionHolder holder = activeSessions.get(sessionId);
        if (holder != null && holder.masterFd >= 0 && TerminalJni.isAvailable()) {
            TerminalJni.setPtyWindowSize(holder.masterFd, rows, cols);
        }
    }

    public void closeSession(String sessionId) {
        SessionHolder holder = activeSessions.remove(sessionId);
        if (holder != null) {
            try {
                if (holder.masterFd >= 0 && TerminalJni.isAvailable()) {
                    TerminalJni.closeFd(holder.masterFd);
                }
                if (holder.process != null) {
                    holder.process.destroy();
                }
            } catch (Exception ignored) {}
        }
    }

    @Override
    public void onDestroy() {
        for (String id : activeSessions.keySet()) {
            closeSession(id);
        }
        super.onDestroy();
    }

    private static FileDescriptor createFdObject(int fd) {
        try {
            FileDescriptor descriptor = new FileDescriptor();
            Field descriptorField = FileDescriptor.class.getDeclaredField("descriptor");
            descriptorField.setAccessible(true);
            descriptorField.setInt(descriptor, fd);
            return descriptor;
        } catch (Exception e) {
            try {
                Constructor<FileDescriptor> constructor = FileDescriptor.class.getDeclaredConstructor(int.class);
                constructor.setAccessible(true);
                return constructor.newInstance(fd);
            } catch (Exception ex) {
                return null;
            }
        }
    }
}
