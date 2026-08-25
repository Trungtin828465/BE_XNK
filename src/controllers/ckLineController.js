const { connectToChrome } = require('./cmaController');

const CKLINE_TRACKING_URL = 'https://es.ckline.co.kr/';
const PAGE_TIMEOUT = 60000;

async function getCKLineTracking(req, res) {
  const bl = String(req.params.bl || '').trim().toUpperCase();

  if (!bl) {
    return res.status(400).json({
      success: false,
      carrier: 'CKLINE',
      message: 'Thiếu mã B/L CK Line',
    });
  }

  try {
    const browser = await connectToChrome();
    const contexts = browser.contexts();

    if (!contexts.length) {
      return res.status(503).json({
        success: false,
        carrier: 'CKLINE',
        code: 'CHROME_CONTEXT_NOT_FOUND',
        message: 'Chrome debug đã kết nối nhưng chưa có browser context.',
      });
    }

    const page = await contexts[0].newPage();

    await page.goto(CKLINE_TRACKING_URL, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT,
    });

    const trackingInput = page
      .locator(
        'input[type="text"]:visible, input:not([type]):visible, textarea:visible',
      )
      .first();
    await trackingInput.waitFor({
      state: 'visible',
      timeout: PAGE_TIMEOUT,
    });

    await trackingInput.fill(bl);
    await trackingInput.evaluate((element) => {
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const searchButton = page.locator(
      '#mf_wfm_intro_btn_cargoTracking',
    );

    if (await searchButton.count()) {
      await searchButton.click({ timeout: PAGE_TIMEOUT });
    } else {
      const submitButton = page
        .locator(
          [
            'input[type="submit"]:visible',
            'button[type="submit"]:visible',
            'input[type="button"][value*="검색"]:visible',
            'input[type="button"][value*="Search"]:visible',
            '[id*="search" i]:visible',
            '[id*="tracking" i]:visible',
            '[id*="cargo" i]:visible',
          ].join(', '),
        )
        .first();

      if (!(await submitButton.count())) {
        throw new Error('Không tìm thấy nút Search trên trang CK Line.');
      }

      await submitButton.click({ timeout: PAGE_TIMEOUT });
    }

    await page.bringToFront();

    return res.status(200).json({
      success: true,
      carrier: 'CKLINE',
      bl,
      message: 'Đã mở CK Line, điền mã B/L và tự động thực hiện tìm kiếm.',
    });
  } catch (error) {
    if (error.code === 'CHROME_EXECUTABLE_NOT_FOUND') {
      return res.status(503).json({
        success: false,
        carrier: 'CKLINE',
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
        carrier: 'CKLINE',
        code: 'CHROME_DEBUG_NOT_RUNNING',
        message: 'Chrome remote debugging chưa chạy trên port 9222.',
      });
    }

    return res.status(500).json({
      success: false,
      carrier: 'CKLINE',
      bl,
      message: 'Không thể mở trang CK Line hoặc thực hiện tracking.',
      error: error.message,
    });
  }
}

module.exports = { getCKLineTracking };
