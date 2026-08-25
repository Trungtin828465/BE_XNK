// Public tracking controller: các controller hãng tàu hiện tại được gom
// qua một entry point để router và frontend dùng chung một cấu trúc.
const { openCmaTracking } = require('./cmaController');
const { getYangMingTracking } = require('./yangMingController');
const { getCKLineTracking } = require('./ckLineController');
const { getShipmentLinkTracking } = require('./shipmentLinkController');

module.exports = {
  openCmaTracking,
  getYangMingTracking,
  getCKLineTracking,
  getShipmentLinkTracking,
};
