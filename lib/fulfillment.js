const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

function formatSupplierEmail(order, supplier, lineItems) {
  const addr = order.shipping_address || {};
  const itemsList = lineItems.map(li =>
    `  • ${li.title} (SKU: ${li.sku || 'N/A'})\n    Quantity: ${li.quantity}\n    Price: $${(li.price * 1).toFixed(2)}`
  ).join('\n');

  const subject = `New Order ${order.name} — Please Ship to Customer`;
  const body = `Hello ${supplier.name},

You have received a new order to fulfill and ship directly to the customer.

ORDER: ${order.name}
DATE: ${new Date().toLocaleString()}

ITEMS TO SHIP:
${itemsList}

SHIP TO:
${order.customer?.first_name || ''} ${order.customer?.last_name || ''}
${addr.address1 || ''}
${addr.address2 ? addr.address2 + '\n' : ''}${addr.city || ''}, ${addr.province || ''} ${addr.zip || ''}
${addr.country || ''}
${order.customer?.phone ? 'Phone: ' + order.customer.phone : ''}

NOTES:
${supplier.notes || 'Please ship within ' + (supplier.default_lead_days || 3) + ' business days.'}

Once shipped, please reply with the tracking number and carrier so we can update the customer.

Thank you,
${process.env.MAIL_FROM || 'Dropship Fulfillment'}
`;

  return { subject, body };
}

async function emailSupplier(order, supplier, lineItems) {
  const { subject, body } = formatSupplierEmail(order, supplier, lineItems);
  const transport = getTransporter();

  const info = await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: supplier.email,
    subject,
    text: body,
  });

  return { subject, body, messageId: info.messageId, accepted: info.accepted };
}

async function verifyConnection() {
  try {
    const transport = getTransporter();
    await transport.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { emailSupplier, verifyConnection };