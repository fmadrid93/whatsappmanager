import makeWASocket, {
  initAuthCreds,
  fetchLatestBaileysVersion,
  proto,
  jidNormalizedUser,
} from "@whiskeysockets/baileys";
import pino from "pino";

async function run() {
  const phone = "59172620787";
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Baileys version: ${version.join(".")}, isLatest: ${isLatest}`);

  const creds = initAuthCreds();
  const state = {
    creds,
    keys: {
      get: async () => ({}),
      set: async () => {},
    },
  };

  const logger = pino({ level: "trace" });

  const socket = makeWASocket({
    auth: state,
    version,
    browser: ["Ubuntu", "Chrome", "120.0.0.0"],
    logger,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });

  socket.ev.on("creds.update", (c) => {
    console.log(">>> [EVENT] creds.update:", {
      registered: c?.registered,
      me: c?.me,
      pairingCode: c?.pairingCode,
    });
  });

  socket.ev.on("connection.update", async (update) => {
    console.log(">>> [EVENT] connection.update:", {
      connection: update.connection,
      isNewLogin: update.isNewLogin,
      qr: update.qr ? "QR_RECEIVED" : undefined,
      lastDisconnect: update.lastDisconnect
        ? {
            error: String(update.lastDisconnect.error),
            statusCode: update.lastDisconnect.error?.output?.statusCode,
          }
        : undefined,
    });

    if (update.qr) {
      console.log(">>> Socket is ready for pairing. Requesting pairing code for:", phone);
      try {
        const code = await socket.requestPairingCode(phone);
        console.log(`\n========================================`);
        console.log(`✅ CÓDIGO GENERADO EXITOSAMENTE: ${code}`);
        console.log(`========================================\n`);
        console.log("Esperando 60 segundos para que se ingrese en WhatsApp...");
      } catch (err) {
        console.error("❌ ERROR al solicitar pairing code:", err);
      }
    }

    if (update.connection === "open") {
      console.log("\n🎉 ¡CONEXIÓN ABIERTA EXITOSAMENTE CON WHATSAPP!");
      console.log("User:", socket.user);
      process.exit(0);
    }
  });

  await new Promise((r) => setTimeout(r, 60000));
  console.log("Timeout de prueba terminado.");
  process.exit(0);
}

run().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
