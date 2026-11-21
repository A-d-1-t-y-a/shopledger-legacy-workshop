var test = require('node:test');
var assert = require('node:assert/strict');
var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

function orderWith(items, coupon, billed) {
  return {
    id: 42,
    date: '01/01/2022',
    customer: 'Walk-in',
    paymentMode: 'cash',
    status: 'completed',
    items: items,
    coupon: coupon,
    subtotal: billed.subtotal,
    discount: billed.discount,
    tax: billed.tax,
    total: billed.total
  };
}

test('invoice uses the current HSN slabs and post-discount taxable amounts', function () {
  var items = [
    { id: 1, name: 'Rice', sku: 'R-1', hsn: '1006', price: 500, qty: 1 },
    { id: 2, name: 'Tea', sku: 'T-1', hsn: '0902', price: 100, qty: 1 }
  ];
  var billed = pricing.computeTotals(items, 'SAVE10');
  var figures = invoice.computeInvoiceFigures(orderWith(items, 'SAVE10', billed));

  assert.equal(figures.subtotal, 600);
  assert.equal(figures.discount, 60);
  assert.equal(figures.tax, 38.7);
  assert.equal(figures.cgst, 19.35);
  assert.equal(figures.sgst, 19.35);
  assert.equal(figures.total, 578.7);
  assert.deepEqual(figures.rows.map(function (row) {
    return [row.hsn, row.gstPercent, row.lineTax];
  }), [['1006', 5, 22.5], ['0902', 18, 16.2]]);
});

test('CURRENT BEHAVIOUR: an inactive historical coupon is dropped when the invoice is recalculated', function () {
  var items = [{ id: 1, name: 'Rice', sku: 'R-1', hsn: '1006', price: 1000, qty: 1 }];
  var order = orderWith(items, 'DIWALI20', {
    subtotal: 1000, discount: 200, tax: 40, total: 840
  });
  var figures = invoice.computeInvoiceFigures(order);

  assert.equal(figures.discount, 0);
  assert.equal(figures.tax, 50);
  assert.equal(figures.total, 1050);
  assert.match(invoice.render(order), /Accountant Reconciliation Notice/);
});

test('CURRENT BEHAVIOUR: reconciliation flags a GST-only mismatch with zero total delta', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }];
  var order = orderWith(items, '', {
    subtotal: 100, discount: 0, tax: 18, total: 105
  });
  var result = reports.getGstReconciliation({ orders: [order] });

  assert.equal(result.mismatchCount, 1);
  assert.equal(result.totalDelta, 0);
  assert.equal(result.rows[0].invoiceTax, 5);
  assert.equal(result.rows[0].invoiceTotal, 105);
  assert.equal(result.rows[0].matched, false);
  assert.doesNotMatch(invoice.render(order), /Accountant Reconciliation Notice/);
});

test('CURRENT BEHAVIOUR: missing HSN uses the current default GST rate', function () {
  var items = [{ id: 1, name: 'Unclassified item', price: 100, qty: 1 }];
  var order = orderWith(items, '', {
    subtotal: 100, discount: 0, tax: 5, total: 105
  });
  var figures = invoice.computeInvoiceFigures(order);

  assert.equal(figures.rows[0].gstPercent, 18);
  assert.equal(figures.tax, 18);
  assert.equal(figures.total, 118);
});
