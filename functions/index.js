const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

exports.sendPushNotification = onDocumentCreated(
  "feed/{docId}",
  async (event) => {
    const snap = event.data;
    if (!snap) { console.log("Sem data no evento"); return; }

    const feedData = snap.data();
    const targetUserId = feedData.targetUserId;
    if (!targetUserId) { console.log("Feed item sem targetUserId, ignorando push"); return; }

    console.log(`Feed item criado para userId: ${targetUserId}, type: ${feedData.type}, text: ${feedData.text || "sem text"}`);

    // Buscar o token FCM do usuário
    const db = getFirestore();
    const userDoc = await db.collection("users").doc(targetUserId).get();
    if (!userDoc.exists) { console.log(`User ${targetUserId} não existe`); return; }

    const userData = userDoc.data();
    const fcmToken = userData.fcmToken;
    if (!fcmToken) { console.log(`User ${targetUserId} (${userData.firstName}) sem fcmToken`); return; }
    console.log(`Token encontrado para ${userData.firstName}, enviando push...`);

    // Montar body a partir do feed item
    const bodyText = feedData.detail
      ? `${feedData.icon || ""} ${feedData.text}: ${feedData.detail}`
      : `${feedData.icon || ""} ${feedData.text || "Nova atualização"}`;

    // Enviar apenas como data message (evita notificação duplicada pelo browser)
    const message = {
      token: fcmToken,
      data: {
        title: "🔔 OVER LABS",
        body: bodyText,
      },
      android: {
        priority: "high",
      },
      webpush: {
        headers: { Urgency: "high" },
      },
    };

    try {
      await getMessaging().send(message);
      console.log(`Push enviado para ${targetUserId}`);
    } catch (err) {
      console.error(`Erro ao enviar push para ${targetUserId}:`, err.message);
      if (
        err.code === "messaging/registration-token-not-registered" ||
        err.code === "messaging/invalid-registration-token"
      ) {
        await db.collection("users").doc(targetUserId).update({ fcmToken: "" });
      }
    }
  }
);
