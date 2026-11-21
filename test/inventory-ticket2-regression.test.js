var test = require('node:test');
var assert = require('node:assert/strict');
var inventory = require('../lib/inventory');
var orders = require('../lib/orders');

test('ticket 2: the exact last sellable unit can be sold', function () {
  var products = [
    { id: 6, name: 'A2 Gir Cow Ghee 500ml', stock: 1, reserved: 0 },
    { id: 10, name: 'Byadgi Chilli Powder', stock: 4, reserved: 3 }
  ];
  var items = [{ id: 6, qty: 1 }, { id: 10, qty: 1 }];

  assert.equal(inventory.getSellableStock(products[0]), 1);
  assert.equal(inventory.getSellableStock(products[1]), 1);
  assert.deepEqual(inventory.check(products, items), { ok: true });
  inventory.reserve(products, items);
  assert.deepEqual(products.map(function (p) { return [p.stock, p.reserved]; }), [[0, 0], [3, 3]]);
});

test('ticket 2: repeated lines cannot sell more than remaining stock', function () {
  var products = [{ id: 10, name: 'Byadgi Chilli Powder', stock: 4, reserved: 1 }];

  assert.deepEqual(inventory.check(products, [{ id: 10, qty: 2 }, { id: 10, qty: 2 }]), {
    ok: false,
    msg: 'Byadgi Chilli Powder is out of stock (3 sellable available)'
  });
});

test('ticket 2: cancelling pending order 1007 restores stock exactly once', function () {
  var db = {
    products: [{ id: 6, name: 'A2 Gir Cow Ghee 500ml', stock: 1, reserved: 0 }],
    customers: [],
    orders: [{ id: 1007, status: 'pending', paymentMode: 'cash', items: [{ id: 6, qty: 2 }] }]
  };

  assert.equal(orders.cancel(db, 1007).ok, true);
  assert.equal(db.orders[0].status, 'cancelled');
  assert.equal(db.products[0].stock, 3);
  assert.equal(orders.cancel(db, 1007).ok, false);
  assert.equal(db.products[0].stock, 3);
});

test('CURRENT BEHAVIOUR: cancellation succeeds when the ordered product no longer exists', function () {
  var db = {
    products: [],
    customers: [],
    orders: [{ id: 1007, status: 'pending', paymentMode: 'cash', items: [{ id: 6, qty: 2 }] }]
  };

  assert.equal(orders.cancel(db, 1007).ok, true);
  assert.equal(db.orders[0].status, 'cancelled');
  assert.deepEqual(db.products, []);
});
