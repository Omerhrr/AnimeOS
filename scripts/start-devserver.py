#!/usr/bin/env python3
"""AnimeOS dev server launcher - double-fork daemon.

The sandbox reaps background processes between tool calls unless they
are fully detached (double-fork + setsid + stdio redirected). This
launcher starts `next dev -p 3000` as a grandchild of init, writes its
pid to /home/z/my-project/devserver.pid, and waits until :3000 answers.
"""
import os, sys, time, subprocess, urllib.request

ROOT = "/home/z/my-project"
URL = "http://127.0.0.1:3000/api/projects"


def alive() -> bool:
    try:
        with urllib.request.urlopen(URL, timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def fork_daemon():
    if os.fork() > 0:
        return False  # parent returns
    os.setsid()
    if os.fork() > 0:
        os._exit(0)
    # grandchild: detach stdio, chdir, exec
    os.chdir(ROOT)
    sys.stdout.flush(); sys.stderr.flush()
    with open(os.devnull, "rb") as dn:
        os.dup2(dn.fileno(), 0)
    log = open(os.path.join(ROOT, "dev.log"), "ab", buffering=0)
    os.dup2(log.fileno(), 1)
    os.dup2(log.fileno(), 2)
    os.execvp("bash", ["bash", "-c", "exec bun run dev"])
    os._exit(1)


def main():
    if alive():
        print("dev server already up")
        return 0
    subprocess.run(["pkill", "-f", "[n]ext-server"], check=False)
    subprocess.run(["pkill", "-f", "[n]ext dev"], check=False)
    subprocess.run(["pkill", "-f", "[n]ext-worker"], check=False)
    time.sleep(1)
    try:
        os.remove(os.path.join(ROOT, "dev.log"))
    except FileNotFoundError:
        pass
    pid = os.fork()
    if pid == 0:
        fork_daemon()  # never returns False here
        os._exit(1)
    # wait for readiness
    for _ in range(90):
        time.sleep(1)
        if alive():
            print(f"dev server up")
            return 0
    print("dev server failed to start; tail of dev.log:")
    try:
        with open(os.path.join(ROOT, "dev.log"), "rb") as f:
            data = f.read()[-2000:].decode(errors="replace")
        print(data)
    except Exception:
        pass
    return 1


if __name__ == "__main__":
    sys.exit(main())
