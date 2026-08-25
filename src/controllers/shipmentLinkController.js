const {
  connectToChrome,
  attachSafeDialogHandler,
} = require('./cmaController');

const SHIPMENT_LINK_URL =
  'https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do';
const PAGE_TIMEOUT = 60000;

async function getShipmentLinkTracking(req, res) {
  const bl = String(req.params.bl || '').trim().toUpperCase();

  if (!bl) {
    return res.status(400).json({
      success: false,
      carrier: 'SHIPMENTLINK',
      message: 'Thiếu mã B/L ShipmentLink',
    });
  }

  try {
    const browser = await connectToChrome();
    const contexts = browser.contexts();

    if (!contexts.length) {
      return res.status(503).json({
        success: false,
        carrier: 'SHIPMENTLINK',
        code: 'CHROME_CONTEXT_NOT_FOUND',
        message: 'Chrome debug đã kết nối nhưng chưa có browser context.',
      });
    }

    const page = attachSafeDialogHandler(await contexts[0].newPage());

    await page.goto(SHIPMENT_LINK_URL, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT,
    });

    const blInput = page.locator('input#NO:visible').first();
    await blInput.waitFor({
      state: 'visible',
      timeout: PAGE_TIMEOUT,
    });

    await blInput.fill(bl);
    await blInput.evaluate((element) => {
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const inputSection = blInput.locator('xpath=ancestor::td[1]');
    const submitButton = inputSection
      .locator(
        'input[type="button"][value="Submit"]:visible, input[type="submit"]:visible, button[type="submit"]:visible, button:visible',
      )
      .first();

    if (await submitButton.count()) {
      await submitButton.click({ timeout: PAGE_TIMEOUT });
    } else {
      await blInput.press('Enter');
    }

    await page.bringToFront();

    return res.status(200).json({
      success: true,
      carrier: 'SHIPMENTLINK',
      bl,
      message: 'Đã mở ShipmentLink, điền mã B/L và tự động thực hiện tracking.',
    });
  } catch (error) {
    if (error.code === 'CHROME_EXECUTABLE_NOT_FOUND') {
      return res.status(503).json({
        success: false,
        carrier: 'SHIPMENTLINK',
        code: 'CHROME_EXECUTABLE_NOT_FOUND',
        message: 'Không tìm thấy trình duyệt Google Chrome trên máy.',
      });
    }

    if (
      error.code === 'ECONNREFUSED' ||
      /ECONNREFUSED|connect.*9222/i.test(error.message || '')
    ) {
      return res.status(503).json({
        success: false,
        carrier: 'SHIPMENTLINK',
        code: 'CHROME_DEBUG_NOT_RUNNING',
        message: 'Chrome remote debugging chưa chạy trên port 9222.',
      });
    }

    return res.status(500).json({
      success: false,
      carrier: 'SHIPMENTLINK',
      bl,
      message: 'Không thể mở ShipmentLink hoặc thực hiện tracking.',
      error: error.message,
    });
  }
}

module.exports = { getShipmentLinkTracking };
