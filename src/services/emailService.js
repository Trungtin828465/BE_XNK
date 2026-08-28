const emailjs = require('@emailjs/nodejs');

async function sendMissingDocumentEmail({ to_email, to_name, order_code, missing_docs }) {
  const { EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY } = process.env;
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY || !EMAILJS_PRIVATE_KEY) {
    const error = new Error('Thiếu biến môi trường EmailJS');
    error.code = 'EMAIL_CONFIG_MISSING';
    throw error;
  }
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY, privateKey: EMAILJS_PRIVATE_KEY });
  return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID,
    { to_email, to_name, order_code, missing_docs },
    { publicKey: EMAILJS_PUBLIC_KEY, privateKey: EMAILJS_PRIVATE_KEY });
}

module.exports = { sendMissingDocumentEmail };
