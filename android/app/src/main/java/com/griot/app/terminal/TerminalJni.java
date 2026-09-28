package com.griot.app.terminal;

import android.util.Log;

public final class TerminalJni {
    private static final String TAG = "TerminalJni";
    private static boolean libraryLoaded = false;

    static {
        try {
            System.loadLibrary("griot_pty");
            libraryLoaded = true;
            Log.i(TAG, "griot_pty native library loaded successfully");
        } catch (Throwable t) {
            libraryLoaded = false;
            Log.w(TAG, "Native library not available, fallback to Java ProcessBuilder: " + t.getMessage());
        }
    }

    public static boolean isAvailable() {
        return libraryLoaded;
    }

    public static native int createSubprocess(
            String cmd,
            String cwd,
            String[] envp,
            int[] processIdArray,
            int rows,
            int cols
    );

    public static native void setPtyWindowSize(int fd, int rows, int cols);

    public static native int waitForProcess(int pid);

    public static native void closeFd(int fd);
}
