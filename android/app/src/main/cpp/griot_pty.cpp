#include <jni.h>
#include <pty.h>
#include <utmp.h>
#include <unistd.h>
#include <termios.h>
#include <sys/ioctl.h>
#include <sys/wait.h>
#include <fcntl.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <android/log.h>

#define LOG_TAG "GriotNativePty"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

/**
 * JNI Implementation for forkpty & terminal control on ARM64 Android Linux
 */
extern "C" {

JNIEXPORT jint JNICALL
Java_com_griot_app_terminal_TerminalJni_createSubprocess(
        JNIEnv *env,
        jclass clazz,
        jstring cmd,
        jstring cwd,
        jobjectArray envp,
        jintArray processIdArray,
        jint rows,
        jint cols) {

    const char *cmd_utf = cmd ? env->GetStringUTFChars(cmd, NULL) : NULL;
    const char *cwd_utf = cwd ? env->GetStringUTFChars(cwd, NULL) : NULL;

    struct winsize size;
    size.ws_row = (unsigned short) rows;
    size.ws_col = (unsigned short) cols;
    size.ws_xpixel = 0;
    size.ws_ypixel = 0;

    int ptm = -1;
    pid_t pid = forkpty(&ptm, NULL, NULL, &size);

    if (pid < 0) {
        LOGE("forkpty failed with errno: %d", errno);
        if (cmd_utf) env->ReleaseStringUTFChars(cmd, cmd_utf);
        if (cwd_utf) env->ReleaseStringUTFChars(cwd, cwd_utf);
        return -1;
    }

    if (pid == 0) {
        // Child process
        if (cwd_utf && strlen(cwd_utf) > 0) {
            if (chdir(cwd_utf) != 0) {
                // Non-fatal, try to continue
            }
        }

        // Apply custom environments if provided
        if (envp != NULL) {
            jsize env_len = env->GetArrayLength(envp);
            for (jsize i = 0; i < env_len; ++i) {
                jstring env_var = (jstring) env->GetObjectArrayElement(envp, i);
                if (env_var != NULL) {
                    const char *var_utf = env->GetStringUTFChars(env_var, NULL);
                    if (var_utf != NULL) {
                        putenv(strdup(var_utf));
                        env->ReleaseStringUTFChars(env_var, var_utf);
                    }
                    env->DeleteLocalRef(env_var);
                }
            }
        }

        // Configure default shell
        const char *shell = (cmd_utf && strlen(cmd_utf) > 0) ? cmd_utf : "/system/bin/sh";
        execl(shell, shell, (char *) NULL);

        // Fallback if exec fails
        LOGE("execl failed: %s, fallback to /system/bin/sh", strerror(errno));
        execl("/system/bin/sh", "/system/bin/sh", (char *) NULL);
        _exit(127);
    }

    // Parent process
    if (cmd_utf) env->ReleaseStringUTFChars(cmd, cmd_utf);
    if (cwd_utf) env->ReleaseStringUTFChars(cwd, cwd_utf);

    if (processIdArray != NULL && env->GetArrayLength(processIdArray) > 0) {
        jint p = (jint) pid;
        env->SetIntArrayRegion(processIdArray, 0, 1, &p);
    }

    // Set non-blocking on master fd
    int flags = fcntl(ptm, F_GETFL, 0);
    if (flags >= 0) {
        fcntl(ptm, F_SETFL, flags | O_NONBLOCK);
    }

    LOGI("Subprocess created successfully: pid=%d, fd=%d", pid, ptm);
    return ptm;
}

JNIEXPORT void JNICALL
Java_com_griot_app_terminal_TerminalJni_setPtyWindowSize(
        JNIEnv *env,
        jclass clazz,
        jint fd,
        jint rows,
        jint cols) {
    struct winsize size;
    size.ws_row = (unsigned short) rows;
    size.ws_col = (unsigned short) cols;
    size.ws_xpixel = 0;
    size.ws_ypixel = 0;
    ioctl(fd, TIOCSWINSZ, &size);
}

JNIEXPORT jint JNICALL
Java_com_griot_app_terminal_TerminalJni_waitForProcess(
        JNIEnv *env,
        jclass clazz,
        jint pid) {
    int status = 0;
    waitpid((pid_t) pid, &status, 0);
    if (WIFEXITED(status)) {
        return WEXITSTATUS(status);
    }
    if (WIFSIGNALED(status)) {
        return -WTERMSIG(status);
    }
    return status;
}

JNIEXPORT void JNICALL
Java_com_griot_app_terminal_TerminalJni_closeFd(
        JNIEnv *env,
        jclass clazz,
        jint fd) {
    if (fd >= 0) {
        close(fd);
    }
}

}
