const { chromium } = require('playwright');

const CKLINE_URL = 'https://es.ckline.co.kr/';
const PAGE_TIMEOUT = 60_000;

function normalizeBlNumber(blNo) {
  const normalized = String(blNo ?? '').trim().toUpperCase();

  if (!normalized) {
    const error = new Error('CK Line B/L No. không được để trống.');
    error.statusCode = 400;
    throw error;
  }

  return normalized;
}

async function openCKLineTracking(blNo) {
  const normalizedBl = normalizeBlNumber(blNo);
  const browser = await chromium.launch({
    headless: false,
    slowMo: 200,
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT);

    await page.goto(CKLINE_URL, {
      waitUntil: 'networkidle',
      timeout: PAGE_TIMEOUT,
    });

    const trackingInput = page.locator('#mf_wfm_intro_ibx_cargoTracking');
    const trackingButton = page.locator('#mf_wfm_intro_btn_cargoTracking');

    await trackingInput.fill(normalizedBl);

    const trackingResponse = page.waitForResponse(
      (response) => response.url().includes('sup.WESSUP411.WESSUP411R01')
        && response.request().method() === 'POST',
      { timeout: PAGE_TIMEOUT },
    );

    await trackingButton.click();
    const response = await trackingResponse;

    if (!response.ok()) {
      throw new Error(`CK Line tracking HTTP ${response.status()}`);
    }

    await page.getByText('Route Information', { exact: true }).last().waitFor({
      state: 'visible',
      timeout: PAGE_TIMEOUT,
    });

    return {
      success: true,
      carrier: 'CK LINE',
      bl: normalizedBl,
      message: 'Đã mở CK Line, điền B/L và thực hiện tracking thành công.',
    };
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}

module.exports = {
  CKLINE_URL,
  normalizeBlNumber,
  openCKLineTracking,
};
