const EVERGREEN_TRACKING_ACTION =
  'https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do';

function normalizeContainerNo(containerNo) {
  return String(containerNo || '')
    .trim()
    .replace(/[\s-]/g, '')
    .toUpperCase();
}

function isValidContainerNo(containerNo) {
  return /^[A-Z]{4}\d{7}$/.test(containerNo);
}

function createEvergreenTrackingRequest(containerNo) {
  const normalizedContainerNo = normalizeContainerNo(containerNo);

  if (!isValidContainerNo(normalizedContainerNo)) {
    const error = new Error('Container number không hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  return {
    success: true,
    carrier: 'EVERGREEN',
    containerNo: normalizedContainerNo,
    trackingRequest: {
      method: 'POST',
      action: EVERGREEN_TRACKING_ACTION,
      fields: {
        TYPE: 'CNTR',
        BL: '',
        CNTR: normalizedContainerNo,
        bkno: '',
        query_bkno: '',
        query_rvs: '',
        query_docno: '',
        query_seq: '',
        PRINT: '',
        SEL: 's_cntr',
        NO: normalizedContainerNo,
      },
    },
  };
}

module.exports = {
  createEvergreenTrackingRequest,
  normalizeContainerNo,
  isValidContainerNo,
};
