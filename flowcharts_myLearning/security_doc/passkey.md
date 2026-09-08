# Passkeys

## "Where is the passkey for `git.cap-cloud.co` stored?"

You have two choices:

- **Use your phone or tablet:** scan the QR code using the phone that already
  contains the passkey.
- **Use your security key:** insert a physical key such as a YubiKey.

> This is a **login QR code**, not an authenticator-app setup QR code.
>
> If you haven't previously created a passkey for `git.cap-cloud.co`, cancel this
> window and use password/2FA — or create a passkey first.

## How a Passkey Works

When you create a passkey, your device generates two related cryptographic keys:

- **Public key:** stored by the website.
- **Private key:** stays securely on your phone, Mac, password manager, or
  hardware security key.

> The private key and your fingerprint **never** go to the website.
> Your fingerprint, Face ID, Touch ID, or PIN only unlocks the private key
> **locally**.

## Passkey versus Traditional 2FA

| Method | Login process | What the website stores |
| --------------- | ---------------------------------------------- | --------------------------------- |
| Password only | Password | Password hash |
| Traditional 2FA | Password + six-digit OTP | Password hash + MFA configuration |
| Passkey | Fingerprint, face, device PIN, or security key | Public key only |

### Traditional 2FA

You provide two separate things:

- **Password** — something you know
- **OTP from your phone** — something you have

```text
Password + 6-digit OTP → Login
```

### Passkey Authentication

Your device holds a private key, while the website holds the corresponding
public key.

```text
Your device/private key
        +
Fingerprint, Face ID or PIN
        ↓
Successful login
```

The fingerprint or PIN unlocks the private key locally. **It is never sent to the
website.**

Therefore, a passkey can prove:

- **Possession:** you have the phone/device containing the private key.
- **User verification:** you unlocked it using fingerprint, Face ID or PIN.

---

> A passkey is a **passwordless authentication credential** based on
> public/private keys, which can provide strong multi-factor authentication in
> one action.
