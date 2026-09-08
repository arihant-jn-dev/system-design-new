# SSH

Think of **SSH (Secure Shell)** as a secure communication protocol that lets two
computers communicate over a network in an encrypted and authenticated way.

## A Simple Analogy

| Protocol | Used for |
|---|---|
| **HTTP** | Browsing websites. |
| **FTP** | Transferring files (not secure by default). |
| **SSH** | Securely logging into another computer, running commands, transferring files, and authenticating services. |

## What Can SSH Be Used For?

**1. Logging into a remote server (most common)**

```bash
ssh ubuntu@192.168.1.10
```

**2. Git authentication (GitHub/GitLab/Bitbucket)**

Git uses SSH to authenticate you.

**3. Secure file transfer**

SSH can securely copy files.

```bash
scp file.txt ubuntu@myserver.com:/home/ubuntu/
```

## How Does SSH Know It's Really You?

SSH uses **public-key cryptography**.

You generate:

```text
Private Key   ← stays on your laptop
Public Key    ← uploaded to the server/GitLab
```

When you connect:

```text
Your Laptop
     │
     │ "I want to connect"
     ▼
Remote Server
     │
     │ "Prove you're the owner of this public key."
     ▼
Laptop signs a challenge using
its PRIVATE KEY
     │
     ▼
Server verifies using the
PUBLIC KEY
     │
     ▼
✔ Access granted
```

> The private key **never** leaves your computer. Only the proof (digital
> signature) is sent.

## Can the Same SSH Key Be Used for Different Applications?

**Yes**, if the application supports SSH authentication.

For example, the same key pair could be used with:

- GitLab
- GitHub
- Bitbucket
- A Linux server
- Other services that accept SSH public keys

You simply upload the same public key to each service.

```text
Private Key (on your laptop)
        │
        ├──► GitLab (Public Key)
        ├──► GitHub (Public Key)
        ├──► AWS EC2 Server (~/.ssh/authorized_keys)
        └──► Internal company server
```

## GitLab SSH

```text
Your Laptop
     │
     │ 1. Generate SSH key pair
     │    (Private Key + Public Key)
     ▼
Private Key (stays on your laptop)
Public Key (uploaded to GitLab)
     │
     ▼
GitLab Account
```

### Step 1: Generate an SSH Key

On your laptop:

```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
```

It creates:

```text
~/.ssh/id_ed25519        ← Private key (KEEP SECRET)
~/.ssh/id_ed25519.pub    ← Public key (Share with GitLab)
```

### Step 2: Add the Public Key to GitLab

Copy the public key:

```bash
cat ~/.ssh/id_ed25519.pub
```

`GitLab → Preferences → SSH Keys`

Now GitLab knows that this public key belongs to your account.

### What Happens When You Run `git push`?

```text
git push
    │
    ▼
Git contacts GitLab via SSH
    │
    ▼
GitLab says:
"Prove you own the private key
for this public key."
    │
    ▼
Your laptop signs a challenge
using the PRIVATE key
    │
    ▼
GitLab verifies the signature
using the PUBLIC key stored
in your GitLab account
    │
    ▼
✔ Authentication successful
    │
    ▼
Git push/pull is allowed
```
