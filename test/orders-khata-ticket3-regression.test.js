var test = require('node:test');
var assert = require('node:assert/strict');
var orders = require('../lib/orders');
var ledger = require('../lib/ledger');
var dates = require('../lib/dates');

test('ticket 3: order history sorts newest first across months and years', function () {
  var db = { orders: [
    { id: 1001, date: '28/12/2021' },
    { id: 1004, date: '30/01/2022' },
    { id: 1008, date: '15/03/2022' }
  ] };

  assert.deepEqual(orders.list(db).map(function (order) { return order.id; }), [1008, 1004, 1001]);
  assert.deepEqual(db.orders.map(function (order) { return order.id; }), [1001, 1004, 1008]);
});

test('ticket 3: HTML date bounds filter order history inclusively', function () {
  var db = { orders: [
    { id: 1001, date: '28/12/2021' },
    { id: 1004, date: '30/01/2022' },
    { id: 1008, date: '15/03/2022' }
  ] };

  assert.equal(dates.normalizeDateKey('30/01/2022'), '2022-01-30');
  assert.equal(dates.normalizeDateKey('2022-01-30'), '2022-01-30');
  assert.equal(dates.getFiscalYear('30/01/2022'), 'FY21-22');
  assert.deepEqual(orders.list(db, { from: '2022-01-30', to: '2022-03-15' })
    .map(function (order) { return order.id; }), [1008, 1004]);
  assert.deepEqual(orders.list(db, { from: '2021-12-28', to: '2021-12-28' })
    .map(function (order) { return order.id; }), [1001]);
});

test('ticket 3: ₹500 input settles Meera’s balance numerically', function () {
  var db = {
    customers: [{ id: 1, name: 'Meera Joshi', openingBalance: 450, totalBilled: 1982.01,
      totalSettled: 1200, balance: 1232.01 }],
    settlements: [],
    nextSettlementId: 501
  };

  var result = ledger.recordSettlement(db, 1, '500', 'upi', 'Counter payment');
  assert.equal(result.ok, true);
  assert.equal(result.customer.totalSettled, 1700);
  assert.equal(result.customer.balance, 732.01);
  assert.equal(result.settlement.amount, 500);
  assert.equal(ledger.listCustomers(db)[0].balance, 732.01);
});

test('CURRENT BEHAVIOUR: exponent text is accepted as a settlement amount', function () {
  var db = {
    customers: [{ id: 1, name: 'Meera Joshi', openingBalance: 1000, totalBilled: 0,
      totalSettled: 0 }],
    settlements: [],
    nextSettlementId: 501
  };

  assert.equal(ledger.recordSettlement(db, 1, '5e2').ok, true);
  assert.equal(db.customers[0].totalSettled, 500);
});

test('ticket 3: nonnumeric settlement input leaves the ledger unchanged', function () {
  var db = {
    customers: [{ id: 1, name: 'Meera Joshi', openingBalance: 1000, totalBilled: 0,
      totalSettled: 0 }],
    settlements: [],
    nextSettlementId: 501
  };

  assert.equal(ledger.recordSettlement(db, 1, 'not a number').ok, false);
  assert.equal(db.customers[0].totalSettled, 0);
  assert.deepEqual(db.settlements, []);
});

test('ticket 3: sub-cent and over-balance settlements do not change the ledger', function () {
  var db = {
    customers: [{ id: 1, name: 'Meera Joshi', openingBalance: 1000, totalBilled: 0,
      totalSettled: 900 }],
    settlements: [],
    nextSettlementId: 501
  };

  assert.equal(ledger.recordSettlement(db, 1, '0.001').ok, false);
  assert.equal(ledger.recordSettlement(db, 1, '101').ok, false);
  assert.equal(db.customers[0].totalSettled, 900);
  assert.deepEqual(db.settlements, []);
});
