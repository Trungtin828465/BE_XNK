const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CMA_TRACKING_URL = 'https://www.cma-cgm.com/ebusiness/tracking';
const CHROME_CDP_URL = 'http://127.0.0.1:9222';
const PAGE_TIMEOUT = 60000;

function getChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function connectToChrome() {
  try {
    return await chromium.connectOverCDP(CHROME_CDP_URL);
  } catch (initialError) {
    if (!isChromeDebugConnectionError(initialError)) throw initialError;

    const chromePath = getChromeExecutable();
    if (!chromePath) {
      const error = new Error('Chrome executable was not found.');
      error.code = 'CHROME_EXECUTABLE_NOT_FOUND';
      throw error;
    }

    const userDataDir =
      process.env.CMA_CHROME_USER_DATA_DIR ||
      path.join(os.tmpdir(), 'cma-cgm-chrome-debug');

    const chrome = spawn(
      chromePath,
      [
        '--remote-debugging-port=9222',
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
      { detached: true, stdio: 'ignore' },
    );
    chrome.unref();

    let lastError = initialError;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      try {
        return await chromium.connectOverCDP(CHROME_CDP_URL);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }
}

function isChromeDebugConnectionError(error) {
  return (
    error?.code === 'ECONNREFUSED' ||
    /ECONNREFUSED|connect.*9222|failed to connect/i.test(error?.message || '')
  );
}

function hasCmaCaptcha(page) {
  return page.frames().some((frame) =>
    frame.url().toLowerCase().includes('captcha-delivery.com'),
  );
}

function attachSafeDialogHandler(page) {
  page.on('dialog', async (dialog) => {
    try {
      await dialog.dismiss();
    } catch (error) {
      // Dialog có thể đã tự đóng trước khi Playwright xử lý.
      if (!/No dialog is showing/i.test(error.message || '')) {
        console.warn('[BROWSER_DIALOG] Không thể đóng dialog:', error.message);
      }
    }
  });

  return page;
}

async function openCmaTracking(req, res) {
  const bl = String(req.params.bl || '').trim();

  if (!bl) {
    return res.status(400).json({
      success: false,
      code: 'BL_REQUIRED',
      message: 'Vui lòng cung cấp mã BL.',
    });
  }

  let browser;

  try {
    browser = await connectToChrome();
    const contexts = browser.contexts();

    if (!contexts.length) {
      return res.status(503).json({
        success: false,
        code: 'CHROME_CONTEXT_NOT_FOUND',
        message: 'Chrome debug đã kết nối nhưng chưa có browser context.',
      });
    }

    const page = attachSafeDialogHandler(await contexts[0].newPage());
    await page.goto(CMA_TRACKING_URL, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT,
    });

    const referenceInput = page.locator('#Reference');
    try {
      await referenceInput.waitFor({ state: 'visible', timeout: PAGE_TIMEOUT });
    } catch (error) {
      if (hasCmaCaptcha(page)) {
        return res.status(403).json({
          success: false,
          code: 'CMA_CAPTCHA_REQUIRED',
          message:
            'CMA CGM đang yêu cầu xác minh CAPTCHA trên Chrome. Hãy xử lý CAPTCHA trên cửa sổ Chrome rồi thử lại.',
        });
      }
      throw error;
    }

    await referenceInput.fill(bl);
    await referenceInput.evaluate((element) => {
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.bringToFront();
    await page.locator('#btnTracking').click({ timeout: PAGE_TIMEOUT });

    return res.status(200).json({
      success: true,
      carrier: 'CMA CGM',
      bl,
      message:
        'Đã mở CMA CGM và tự động điền mã tracking. Người dùng chỉ cần nhấn Enter.',
    });
  } catch (error) {
    if (isChromeDebugConnectionError(error)) {
      return res.status(503).json({
        success: false,
        code: 'CHROME_DEBUG_NOT_RUNNING',
        message: 'Chrome remote debugging chưa chạy trên port 9222.',
      });
    }

    return res.status(500).json({
      success: false,
      code: 'CMA_TRACKING_OPEN_FAILED',
      message: 'Không thể mở trang tracking CMA CGM hoặc điền mã BL.',
      error: error.message,
    });
  }
}

module.exports = {
  openCmaTracking,
  connectToChrome,
  attachSafeDialogHandler,
};


// const { chromium } = require('playwright');

// const CMA_TRACKING_URL = 'https://www.cma-cgm.com/ebusiness/tracking';
// const PAGE_TIMEOUT = 60000;

// function hasCmaCaptcha(page) {
//   return page.frames().some((frame) =>
//     frame.url().toLowerCase().includes('captcha-delivery.com'),
//   );
// }

// function attachSafeDialogHandler(page) {
//   page.on('dialog', async (dialog) => {
//     try {
//       await dialog.dismiss();
//     } catch (error) {
//       // Dialog có thể đã tự đóng trước khi Playwright xử lý.
//       if (!/No dialog is showing/i.test(error.message || '')) {
//         console.warn(
//           '[BROWSER_DIALOG] Không thể đóng dialog:',
//           error.message,
//         );
//       }
//     }
//   });

//   return page;
// }

// async function createCmaBrowser() {
//   return chromium.launch({
//     headless: true,

//     args: [
//       '--disable-blink-features=AutomationControlled',
//       '--disable-dev-shm-usage',
//       '--no-sandbox',
//     ],
//   });
// }

// async function openCmaTracking(req, res) {
//   const bl = String(req.params.bl || '').trim();

//   if (!bl) {
//     return res.status(400).json({
//       success: false,
//       code: 'BL_REQUIRED',
//       message: 'Vui lòng cung cấp mã BL.',
//     });
//   }

//   let browser;

//   try {
//     // 1. Chạy Chromium ngầm, không mở cửa sổ Chrome
//     browser = await createCmaBrowser();

//     // 2. Tạo browser context
//     const context = await browser.newContext({
//       viewport: {
//         width: 1440,
//         height: 900,
//       },

//       locale: 'en-US',

//       userAgent:
//         'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
//         'AppleWebKit/537.36 (KHTML, like Gecko) ' +
//         'Chrome/140.0.0.0 Safari/537.36',
//     });

//     // 3. Tạo tab
//     const page = attachSafeDialogHandler(await context.newPage());

//     // 4. Mở CMA CGM
//     await page.goto(CMA_TRACKING_URL, {
//       waitUntil: 'domcontentloaded',
//       timeout: PAGE_TIMEOUT,
//     });

//     // 5. Tìm ô nhập BL
//     const referenceInput = page.locator('#Reference');

//     try {
//       await referenceInput.waitFor({
//         state: 'visible',
//         timeout: PAGE_TIMEOUT,
//       });
//     } catch (error) {
//       if (hasCmaCaptcha(page)) {
//         return res.status(403).json({
//           success: false,
//           code: 'CMA_CAPTCHA_REQUIRED',
//           message:
//             'CMA CGM yêu cầu CAPTCHA. Chế độ headless không thể để người dùng xử lý CAPTCHA trực tiếp.',
//         });
//       }

//       throw error;
//     }

//     // 6. Điền BL
//     await referenceInput.fill(bl);

//     // Một số website cần event input/change
//     await referenceInput.evaluate((element) => {
//       element.dispatchEvent(
//         new Event('input', {
//           bubbles: true,
//         }),
//       );

//       element.dispatchEvent(
//         new Event('change', {
//           bubbles: true,
//         }),
//       );
//     });

//     // 7. Click Tracking
//     const trackingButton = page.locator('#btnTracking');

//     await trackingButton.waitFor({
//       state: 'visible',
//       timeout: PAGE_TIMEOUT,
//     });

//     await trackingButton.click({
//       timeout: PAGE_TIMEOUT,
//     });

//     // Chờ website xử lý
//     await page.waitForTimeout(3000);

//     // Kiểm tra captcha sau khi click
//     if (hasCmaCaptcha(page)) {
//       return res.status(403).json({
//         success: false,
//         code: 'CMA_CAPTCHA_REQUIRED',
//         message:
//           'CMA CGM yêu cầu CAPTCHA sau khi gửi mã BL.',
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       carrier: 'CMA CGM',
//       bl,
//       message: 'Đã gửi mã BL lên CMA CGM bằng Playwright headless.',
//     });
//   } catch (error) {
//     console.error('[CMA_TRACKING_ERROR]', error);

//     return res.status(500).json({
//       success: false,
//       code: 'CMA_TRACKING_FAILED',
//       message: 'Không thể tracking CMA CGM.',
//       error: error.message,
//     });
//   } finally {
//     // Rất quan trọng:
//     // request xong phải đóng browser
//     if (browser) {
//       try {
//         await browser.close();
//       } catch (error) {
//         console.warn(
//           '[CMA_BROWSER_CLOSE_ERROR]',
//           error.message,
//         );
//       }
//     }
//   }
// }

// module.exports = {
//   openCmaTracking,
//   createCmaBrowser,
//   attachSafeDialogHandler,
// };