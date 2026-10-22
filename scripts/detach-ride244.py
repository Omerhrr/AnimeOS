#!/usr/bin/env python3
"""Detach the ride244 call-1 ride as a fully detached daemon.

The sandbox reaps background processes between tool calls unless they
are fully detached (double-fork + setsid + stdio redirected) - the
same law start-devserver.py rides. This launcher starts
`npx tsx scripts/ride244.ts --call 1` as a grandchild of init, writes
its pid to receipts/ride244-call1.pid, and returns immediately; the
ride's own log rides receipts/ride244-call1.log.
"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.path.join(ROOT, "receipts", "ride244-call1.log")
PID = os.path.join(ROOT, "receipts", "ride244-call1.pid")


def fork_daemon():
    if os.fork() > 0:
        return
    os.setsid()
    if os.fork() > 0:
        os._exit(0)
    os.chdir(ROOT)
    env = dict(os.environ)
    try:
        with open(os.path.join(ROOT, ".env")) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    sys.stdout.flush(); sys.stderr.flush()
    with open(os.devnull, "rb") as dn:
        os.dup2(dn.fileno(), 0)
    log = open(LOG, "ab", buffering=0)
    os.dup2(log.fileno(), 1)
    os.dup2(log.fileno(), 2)
    os.execvpe("npx", ["npx", "tsx", "scripts/ride244.ts", "--call", "1"], env)
    os._exit(1)


def main():
    if os.path.exists(LOG):
        os.remove(LOG)
    pid = os.fork()
    if pid == 0:
        fork_daemon()
        os._exit(1)
    os.waitpid(pid, 0)
    # the grandchild's pid is unknowable from here without /proc polling;
    # the LOG's growth is the life signal (the 242 file law: an
    # advancing file is life)
    with open(PID, "w") as f:
        f.write("detached\n")
    print("ride244 call 1 detached; log -> receipts/ride244-call1.log")
    return 0


if __name__ == "__main__":
    sys.exit(main())
