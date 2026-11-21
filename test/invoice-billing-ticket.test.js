var test = require('node:test');
var assert = require('node:assert/strict');
var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

function billedOrder(items, coupon, billed) {
  return {
    id: 77,
    date: '21/11/2026',
    customer: 'Test customer',
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

test('synthetic order 1002 invoice agrees with the ₹963.90 checkout bill and ₹45.90 GST', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 1020, qty: 1 }];
  var billed = pricing.computeTotals(items, 'SAVE10');
  var order = billedOrder(items, 'SAVE10', billed);
  order.id = 1002;
  var figures = invoice.computeInvoiceFigures(order);

  assert.equal(billed.discount, 102);
  assert.equal(billed.tax, 45.9);
  assert.equal(billed.total, 963.9);
  assert.equal(figures.tax, billed.tax);
  assert.equal(figures.total, billed.total);
  assert.match(invoice.render(order), /Invoice Total<\/td><td class="r">₹963\.90/);
  assert.doesNotMatch(invoice.render(order), /Accountant Reconciliation Notice/);
});

test('invoice applies the current coupon cap before calculating each HSN GST slab', function () {
  var items = [
    { id: 1, name: 'Rice', hsn: '1006', price: 1000, qty: 1 },
    { id: 2, name: 'Tea', hsn: '0902', price: 1000, qty: 1 }
  ];
  var billed = pricing.computeTotals(items, 'SAVE10');
  var figures = invoice.computeInvoiceFigures(billedOrder(items, 'SAVE10', billed));

  assert.equal(billed.discount, 150);
  assert.deepEqual(figures.rows.map(function (row) {
    return [row.gstPercent, row.lineTax];
  }), [[5, 46.25], [18, 166.5]]);
  assert.equal(figures.tax, 212.75);
  assert.equal(figures.cgst, 106.38);
  assert.equal(figures.sgst, 106.37);
  assert.equal(figures.total, 2062.75);
});

test('invoice currently caps SAVE10 at ₹150 on a ₹2,240 order', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 2240, qty: 1 }];
  var billed = pricing.computeTotals(items, 'SAVE10');
  var order = billedOrder(items, 'SAVE10', billed);
  var figures = invoice.computeInvoiceFigures(order);

  assert.equal(figures.subtotal, 2240);
  assert.equal(figures.discount, 150);
  assert.equal(figures.rows[0].lineTax, 104.5);
  assert.equal(figures.total, 2194.5);
  assert.equal(reports.getGstReconciliation({ orders: [order] }).mismatchCount, 0);
});

test('non-coupon 5% and 12% HSN items use their current slabs on the invoice', function () {
  var items = [
    { id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 },
    { id: 2, name: 'Ghee', hsn: '0405', price: 100, qty: 1 }
  ];
  var billed = pricing.computeTotals(items, '');
  var figures = invoice.computeInvoiceFigures(billedOrder(items, '', billed));

  assert.deepEqual(figures.rows.map(function (row) {
    return [row.gstPercent, row.lineTax];
  }), [[5, 5], [12, 12]]);
  assert.equal(figures.tax, 17);
  assert.equal(figures.total, 217);
});

test('CURRENT BEHAVIOUR: rounded line discounts can disagree with the printed invoice total', function () {
  var items = [
    { id: 1, name: 'A', price: 0.05, qty: 1 },
    { id: 2, name: 'B', price: 0.05, qty: 1 },
    { id: 3, name: 'C', price: 0.05, qty: 1 }
  ];
  var billed = pricing.computeTotals(items, 'WELCOME');
  var order = billedOrder(items, 'WELCOME', billed);
  var figures = invoice.computeInvoiceFigures(order);

  assert.equal(figures.discount, 0.01);
  assert.equal(figures.tax, 0.03);
  assert.equal(figures.total, 0.17);
  assert.deepEqual(billed.lines.map(function (line) { return line.discount; }), [0, 0, 0]);
  assert.equal(billed.lines.reduce(function (sum, line) { return sum + line.net; }, 0), 0.18);
  assert.match(invoice.render(order), /Invoice Total<\/td><td class="r">₹0\.17/);
  assert.doesNotMatch(invoice.render(order), /Accountant Reconciliation Notice/);
});

test('CURRENT BEHAVIOUR: a discount-only ledger difference is reported as matched', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }];
  var order = billedOrder(items, '', {
    subtotal: 100, discount: 7, tax: 5, total: 105
  });
  var result = reports.getGstReconciliation({ orders: [order] });

  assert.equal(result.rows[0].ledgerDiscount, 7);
  assert.equal(result.rows[0].invoiceDiscount, 0);
  assert.equal(result.rows[0].matched, true);
  assert.equal(result.mismatchCount, 0);
});
