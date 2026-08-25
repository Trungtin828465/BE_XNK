const { connectToChrome } = require('./cmaController');

const YANG_MING_TRACKING_URL =
  'https://www.yangming.com/en/esolution/cargo_tracking';
const PAGE_TIMEOUT = 60000;

async function getYangMingTracking(req, res) {
  const trackingNumber = String(req.params.trackingNumber || '').trim();

  if (!trackingNumber) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu mã tracking Yang Ming',
    });
  }

  try {
    const browser = await connectToChrome();
    const contexts = browser.contexts();

    if (!contexts.length) {
      return res.status(503).json({
        success: false,
        code: 'CHROME_CONTEXT_NOT_FOUND',
        message: 'Chrome debug đã kết nối nhưng chưa có browser context.',
      });
    }

    const page = await contexts[0].newPage();

    await page.goto(YANG_MING_TRACKING_URL, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT,
    });

    const trackingInput = page.locator('input:visible').first();
    await trackingInput.waitFor({
      state: 'visible',
      timeout: PAGE_TIMEOUT,
    });

    await trackingInput.fill(trackingNumber);
    await trackingInput.evaluate((element) => {
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await page.getByRole('button', { name: /^search$/i }).click({
      timeout: PAGE_TIMEOUT,
    });
    await page.bringToFront();

    return res.status(200).json({
      success: true,
      carrier: 'YANG_MING',
      trackingNumber,
      message: 'Đã mở Yang Ming, điền mã tracking và tự động tìm kiếm.',
    });
  } catch (error) {
    if (error.code === 'CHROME_EXECUTABLE_NOT_FOUND') {
      return res.status(503).json({
        success: false,
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
        code: 'CHROME_DEBUG_NOT_RUNNING',
        message: 'Chrome remote debugging chưa chạy trên port 9222.',
      });
    }

    return res.status(500).json({
      success: false,
      carrier: 'YANG_MING',
      trackingNumber,
      message: 'Không thể mở trang Yang Ming hoặc thực hiện tracking.',
      error: error.message,
    });
  }
}

module.exports = { getYangMingTracking };
