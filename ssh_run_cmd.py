import os
import sys
import paramiko

def run_ssh_command(custom_cmd=None):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    if custom_cmd:
        cmd = custom_cmd
    else:
        cmd_file = "ssh_cmd.txt"
        if not os.path.exists(cmd_file):
            print("Command file ssh_cmd.txt not found!")
            return 1
        with open(cmd_file, "r", encoding="utf-8") as f:
            cmd = f.read().strip()
    
    if not cmd:
        print("Command is empty!")
        return 1

    host = "64.227.179.37"
    port = 22
    username = "geetha"
    password = "Dial2techGeetha"

    print(f"Connecting to {host}:{port} as {username}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(
            host, 
            port, 
            username, 
            password, 
            timeout=40, 
            banner_timeout=60,
            gss_auth=False,
            gss_kex=False
        )
        print(f"Executing command: {cmd}")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        out = stdout.read().decode('utf-8', errors='ignore')
        err = stderr.read().decode('utf-8', errors='ignore')
        print("=== STDOUT ===")
        print(out)
        print("=== STDERR ===")
        print(err)
        return stdout.channel.recv_exit_status()
    except Exception as e:
        print(f"Connection failed: {e}")
        return 1
    finally:
        ssh.close()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        sys.exit(run_ssh_command(" ".join(sys.argv[1:])))
    else:
        sys.exit(run_ssh_command())

