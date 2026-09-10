const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');

async function request(body) {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/tracking/evergreen/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('EMCU5513997 trả về cấu hình POST status 200', async () => {
  const result = await request({ containerNo: 'EMCU5513997' });

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.carrier, 'EVERGREEN');
  assert.equal(result.body.containerNo, 'EMCU5513997');
  assert.equal(result.body.trackingRequest.method, 'POST');
  assert.equal(result.body.trackingRequest.fields.CNTR, 'EMCU5513997');
  assert.equal(result.body.trackingRequest.fields.NO, 'EMCU5513997');
});

test('chuẩn hóa emcu 5513997 thành EMCU5513997', async () => {
  const result = await request({ containerNo: 'emcu 5513997' });

  assert.equal(result.status, 200);
  assert.equal(result.body.containerNo, 'EMCU5513997');
});

test('container sai định dạng trả về status 400', async () => {
  const result = await request({ containerNo: 'EMCU123' });

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, {
    success: false,
    message: 'Container number không hợp lệ',
  });
});

test('thiếu containerNo trả về status 400', async () => {
  const result = await request({});

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, {
    success: false,
    message: 'Container number không hợp lệ',
  });
});
