const {
  initializeApp,
  cert,
  getApps
} = require('firebase-admin/app');

const {
  getMessaging
} = require('firebase-admin/messaging');

const serviceAccount = require('../../firebase-notification.json');

const app =
  getApps().length === 0
    ? initializeApp({
        credential: cert(serviceAccount)
      })
    : getApps()[0];

const messaging = getMessaging(app);

module.exports = {
  app,
  messaging
};