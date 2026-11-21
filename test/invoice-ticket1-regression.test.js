var test = require('node:test');
var assert = require('node:assert/strict');
var invoice = require('../lib/invoice');
var pricing = require('../lib/pricing');
var reports = require('../lib/reports');

function order(id, items, coupon) {
  var bill = pricing.computeTotals(items, coupon);
  return {
    id: id,
    date: '05/01/2022',
    customer: 'Test customer',
    status: 'completed',
    paymentMode: 'cash',
    items: items,
    coupon: coupon,
    subtotal: bill.subtotal,
    discount: bill.discount,
    tax: bill.tax,
    total: bill.total
  };
}

test('ticket 1: invoice 1002 matches the charged SAVE10 total and GST', function () {
  var billed = order(1002, [
    { id: 1, sku: 'GRN-001', name: 'Indrayani Basmati Rice 5kg', hsn: '1006', price: 640, qty: 1 },
    { id: 4, sku: 'OIL-001', name: 'Cold-Pressed Sunflower Oil 1L', hsn: '1512', price: 190, qty: 2 }
  ], 'SAVE10');
  var figures = invoice.computeInvoiceFigures(billed);

  assert.equal(billed.total, 963.9);
  assert.equal(billed.tax, 45.9);
  assert.equal(figures.total, billed.total);
  assert.equal(figures.tax, billed.tax);
  assert.deepEqual(figures.rows.map(function (row) { return row.gstPercent; }), [5, 5]);
  assert.equal(reports.getGstReconciliation({ orders: [billed] }).mismatchCount, 0);
  assert.match(invoice.render(billed), /Invoice Total<\/td><td class="r">₹963\.90/);
});

test('ticket 1: invoice 1004 respects the ₹150 SAVE10 cap', function () {
  var billed = order(1004, [
    { id: 5, sku: 'OIL-002', name: 'Cold-Pressed Groundnut Oil 5L', hsn: '1508', price: 1120, qty: 2 }
  ], 'SAVE10');
  var figures = invoice.computeInvoiceFigures(billed);

  assert.equal(billed.discount, 150);
  assert.equal(figures.discount, 150);
  assert.equal(figures.tax, 104.5);
  assert.equal(figures.total, 2194.5);
});

test('ticket 1: non-coupon invoices use the 5% and 12% HSN rates', function () {
  var billed = order(1007, [
    { id: 6, name: 'A2 Gir Cow Ghee 500ml', hsn: '0405', price: 450, qty: 2 },
    { id: 4, name: 'Cold-Pressed Sunflower Oil 1L', hsn: '1512', price: 190, qty: 2 }
  ], '');
  var figures = invoice.computeInvoiceFigures(billed);

  assert.deepEqual(figures.rows.map(function (row) { return [row.gstPercent, row.lineTax]; }),
    [[12, 108], [5, 19]]);
  assert.equal(figures.tax, 127);
  assert.equal(figures.total, 1407);
});
