const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

exports.sendPushNotification = onDocumentCreated(
  "notifications/{userId}/items/{docId}",
  async (event) => {
    const snap = event.data;
    if (!snap) { console.log("Sem data no evento"); return; }

    const notifData = snap.data();
    const userId = event.params.userId;
    console.log(`Notificação criada para userId: ${userId}, msg: ${notifData.msg || "sem msg"}`);

    // Buscar o token FCM do usuário
    const db = getFirestore();
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) { console.log(`User ${userId} não existe`); return; }

    const userData = userDoc.data();
    const fcmToken = userData.fcmToken;
    if (!fcmToken) { console.log(`User ${userId} (${userData.firstName}) sem fcmToken`); return; }
    console.log(`Token encontrado para ${userData.firstName}, enviando push...`);

    // Montar e enviar a notificação push
    const message = {
      token: fcmToken,
      notification: {
        title: "🔔 OVER LABS",
        body: notifData.msg || "Nova notificação",
      },
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "overlabs_notifications",
        },
      },
      webpush: {
        headers: { Urgency: "high" },
        notification: {
          icon: "https://mkodgssjb27-sketch.github.io/overlabs/icon-192.png",
          badge: "https://mkodgssjb27-sketch.github.io/overlabs/icon-192.png",
          vibrate: [200, 100, 200],
          requireInteraction: false,
        },
      },
    };

    try {
      await getMessaging().send(message);
      console.log(`Push enviado para ${userId}`);
    } catch (err) {
      console.error(`Erro ao enviar push para ${userId}:`, err.message);
      // Se o token expirou, limpar
      if (
        err.code === "messaging/registration-token-not-registered" ||
        err.code === "messaging/invalid-registration-token"
      ) {
        await db.collection("users").doc(userId).update({ fcmToken: "" });
      }
    }
  }
);
