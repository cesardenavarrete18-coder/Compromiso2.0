/* Linux-only test launcher. Descendants may create Unix sockets, never IP sockets. */
#define _GNU_SOURCE
#include <errno.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <unistd.h>

int main(int argc, char **argv) {
    if (argc < 2) {
        fputs("usage: deny-network COMMAND [ARG ...]\n", stderr);
        return 64;
    }
    /* No inherited network or broker FD may bypass socket creation filtering. */
#if defined(__NR_close_range)
    if (syscall(__NR_close_range, 3U, ~0U, 0) != 0) {
#endif
        long limit = sysconf(_SC_OPEN_MAX);
        if (limit < 0) return 77;
        for (long fd = 3; fd < limit; fd++) close((int)fd);
#if defined(__NR_close_range)
    }
#endif
#if defined(__x86_64__)
    const unsigned int expected_arch = AUDIT_ARCH_X86_64;
#elif defined(__aarch64__)
    const unsigned int expected_arch = AUDIT_ARCH_AARCH64;
#else
#error "Unsupported architecture: isolation must fail closed"
#endif
    struct sock_filter filter[] = {
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch)),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, expected_arch, 1, 0),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
#if defined(__x86_64__)
        /* Reject the x32 ABI, whose syscall numbers differ on the same arch. */
        BPF_JUMP(BPF_JMP | BPF_JSET | BPF_K, 0x40000000U, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM),
#endif
#if defined(__NR_io_uring_setup)
        /* io_uring socket operations must not bypass the socket syscall gate. */
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_io_uring_setup, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM),
#endif
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_socket, 0, 3),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, args[0])),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AF_UNIX, 1, 0),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
    };
    struct sock_fprog program = { .len = sizeof(filter) / sizeof(filter[0]), .filter = filter };
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0 ||
        prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &program) != 0) {
        perror("network isolation unavailable");
        return 77;
    }
    /* Verify the installed filter, rather than trusting a launcher flag. */
    int families[] = { AF_INET, AF_INET6 };
    for (size_t i = 0; i < sizeof(families) / sizeof(families[0]); i++) {
        errno = 0;
        int fd = socket(families[i], SOCK_STREAM, 0);
        if (fd >= 0 || errno != EPERM) {
            if (fd >= 0) close(fd);
            fputs("network isolation probe failed\n", stderr);
            return 77;
        }
    }
    int local_fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (local_fd < 0) {
        fputs("BLOCKED: IP socket denial verified, but this runtime does not permit required Unix sockets\n", stderr);
        return 77;
    }
    close(local_fd);
    execvp(argv[1], &argv[1]);
    perror("exec test command");
    return 127;
}
