# Mobile LAN test

Run Expo from `apps/mobile`, not the repository root:

```powershell
pnpm --dir apps/mobile start:lan -- --port 8081
```

Connect the phone and computer to the same Wi-Fi network, then scan the Expo
QR code or open `exp://<LAN_IP>:8081` in Expo Go. If the QR code fails, check
the Windows firewall and use the printed LAN URL directly. Stop the process
with `Ctrl+C`.

This is a local reachability/demo check only. The development learning registry
is local-only. Authenticated server testing requires a non-empty
`EXPO_PUBLIC_API_ORIGIN`, a running server, and valid session configuration;
an Expo HTTP 200 does not prove ranked or production readiness.
