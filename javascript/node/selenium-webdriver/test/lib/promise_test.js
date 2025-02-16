// Licensed to the Software Freedom Conservancy (SFC) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The SFC licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

'use strict'

const assert = require('assert')

const testutil = require('./testutil')
const promise = require('../../lib/promise')

// Aliases for readability.
const NativePromise = Promise
const StubError = testutil.StubError
const assertIsStubError = testutil.assertIsStubError
const callbackPair = testutil.callbackPair
const throwStubError = testutil.throwStubError
const fail = () => assert.fail()

// Refer to promise_aplus_test for promise compliance with standard behavior.
describe('promise', function () {
  let app, uncaughtExceptions

  beforeEach(function setUp() {
    if (promise.USE_PROMISE_MANAGER) {
      promise.LONG_STACK_TRACES = false
      uncaughtExceptions = []

      app = promise.controlFlow()
      app.on(promise.ControlFlow.EventType.UNCAUGHT_EXCEPTION, (e) => uncaughtExceptions.push(e))
    }
  })

  afterEach(function tearDown() {
    if (promise.USE_PROMISE_MANAGER) {
      app.reset()
      promise.setDefaultFlow(new promise.ControlFlow())
      assert.deepStrictEqual([], uncaughtExceptions, 'Did not expect any uncaught exceptions')
      promise.LONG_STACK_TRACES = false
    }
  })

  it('isPromise', () => {
    const v = () => {}
    const x = new Promise(v, v)
    const p = createRejectedPromise('reject')
    const q = Promise.resolve('resolved')
    const t = { then() {} }
    const f = () => {}
    f.then = () => {}
    assert.equal(true, promise.isPromise(x))
    assert.equal(true, promise.isPromise(p))
    assert.equal(true, promise.isPromise(q))
    assert.equal(true, promise.isPromise(t))
    assert.equal(true, promise.isPromise(f))
    assert.equal(false, promise.isPromise(0))
    assert.equal(false, promise.isPromise(false))
    assert.equal(false, promise.isPromise(true))
    assert.equal(false, promise.isPromise(null))
    assert.equal(false, promise.isPromise(undefined))
    assert.equal(false, promise.isPromise(''))
    assert.equal(false, promise.isPromise('promise'))
    assert.equal(false, promise.isPromise(v))
  })

  function defer() {
    let d = {}
    let promise = new Promise((resolve, reject) => {
      Object.assign(d, { resolve, reject })
    })
    d.promise = promise
    return d
  }

  function createRejectedPromise(reason) {
    var p = Promise.reject(reason)
    p.catch(function () {}) // Silence unhandled rejection handlers.
    return p
  }

  describe('fullyResolved', function () {
    it('primitives', function () {
      function runTest(value) {
        return promise.fullyResolved(value).then((resolved) => assert.strictEqual(value, resolved))
      }
      return runTest(true)
        .then(() => runTest(function () {}))
        .then(() => runTest(null))
        .then(() => runTest(123))
        .then(() => runTest('foo bar'))
        .then(() => runTest(undefined))
    })

    it('arrayOfPrimitives', function () {
      var fn = function () {}
      const array = [true, fn, null, 123, '', undefined, 1]
      return promise.fullyResolved(array).then(function (resolved) {
        assert.strictEqual(array, resolved)
        assert.deepStrictEqual([true, fn, null, 123, '', undefined, 1], resolved)
      })
    })

    it('nestedArrayOfPrimitives', function () {
      var fn = function () {}
      const array = [true, [fn, null, 123], '', undefined]
      return promise.fullyResolved(array).then(function (resolved) {
        assert.strictEqual(array, resolved)
        assert.deepStrictEqual([true, [fn, null, 123], '', undefined], resolved)
        assert.deepStrictEqual([fn, null, 123], resolved[1])
      })
    })

    it('arrayWithPromisedPrimitive', function () {
      return promise.fullyResolved([Promise.resolve(123)]).then(function (resolved) {
        assert.deepStrictEqual([123], resolved)
      })
    })

    it('promiseResolvesToPrimitive', function () {
      return promise.fullyResolved(Promise.resolve(123)).then((resolved) => assert.strictEqual(123, resolved))
    })

    it('promiseResolvesToArray', function () {
      var fn = function () {}
      const array = [true, [fn, null, 123], '', undefined]
      const aPromise = Promise.resolve(array)

      var result = promise.fullyResolved(aPromise)
      return result.then(function (resolved) {
        assert.strictEqual(array, resolved)
        assert.deepStrictEqual([true, [fn, null, 123], '', undefined], resolved)
        assert.deepStrictEqual([fn, null, 123], resolved[1])
      })
    })

    it('promiseResolvesToArrayWithPromises', function () {
      var nestedPromise = Promise.resolve(123)
      const aPromise = Promise.resolve([true, nestedPromise])
      return promise.fullyResolved(aPromise).then(function (resolved) {
        assert.deepStrictEqual([true, 123], resolved)
      })
    })

    it('rejectsIfArrayPromiseRejects', function () {
      var nestedPromise = createRejectedPromise(new StubError())
      const aPromise = Promise.resolve([true, nestedPromise])

      return promise.fullyResolved(aPromise).then(assert.fail, assertIsStubError)
    })

    it('rejectsOnFirstArrayRejection', function () {
      var e1 = new Error('foo')
      var e2 = new Error('bar')
      const aPromise = Promise.resolve([createRejectedPromise(e1), createRejectedPromise(e2)])

      return promise.fullyResolved(aPromise).then(assert.fail, function (error) {
        assert.strictEqual(e1, error)
      })
    })

    it('rejectsIfNestedArrayPromiseRejects', function () {
      const aPromise = Promise.resolve([Promise.resolve([createRejectedPromise(new StubError())])])

      return promise.fullyResolved(aPromise).then(assert.fail, assertIsStubError)
    })

    it('simpleHash', function () {
      var hash = { a: 123 }
      return promise.fullyResolved(hash).then(function (resolved) {
        assert.strictEqual(hash, resolved)
        assert.deepStrictEqual(hash, { a: 123 })
      })
    })

    it('nestedHash', function () {
      var nestedHash = { foo: 'bar' }
      var hash = { a: 123, b: nestedHash }

      return promise.fullyResolved(hash).then(function (resolved) {
        assert.strictEqual(hash, resolved)
        assert.deepStrictEqual({ a: 123, b: { foo: 'bar' } }, resolved)
        assert.strictEqual(nestedHash, resolved['b'])
      })
    })

    it('promiseResolvesToSimpleHash', function () {
      var hash = { a: 123 }
      const aPromise = Promise.resolve(hash)

      return promise.fullyResolved(aPromise).then((resolved) => assert.strictEqual(hash, resolved))
    })

    it('promiseResolvesToNestedHash', function () {
      var nestedHash = { foo: 'bar' }
      var hash = { a: 123, b: nestedHash }
      const aPromise = Promise.resolve(hash)

      return promise.fullyResolved(aPromise).then(function (resolved) {
        assert.strictEqual(hash, resolved)
        assert.strictEqual(nestedHash, resolved['b'])
        assert.deepStrictEqual(hash, { a: 123, b: { foo: 'bar' } })
      })
    })

    it('promiseResolvesToHashWithPromises', function () {
      const aPromise = Promise.resolve({
        a: Promise.resolve(123),
      })

      return promise.fullyResolved(aPromise).then(function (resolved) {
        assert.deepStrictEqual({ a: 123 }, resolved)
      })
    })

    it('rejectsIfHashPromiseRejects', function () {
      const aPromise = Promise.resolve({
        a: createRejectedPromise(new StubError()),
      })

      return promise.fullyResolved(aPromise).then(assert.fail, assertIsStubError)
    })

    it('rejectsIfNestedHashPromiseRejects', function () {
      const aPromise = Promise.resolve({
        a: { b: createRejectedPromise(new StubError()) },
      })

      return promise.fullyResolved(aPromise).then(assert.fail, assertIsStubError)
    })

    it('instantiatedObject', function () {
      function Foo() {
        this.bar = 'baz'
      }
      var foo = new Foo()

      return promise.fullyResolved(foo).then(function (resolvedFoo) {
        assert.strictEqual(foo, resolvedFoo)
        assert.ok(resolvedFoo instanceof Foo)
        assert.deepStrictEqual(new Foo(), resolvedFoo)
      })
    })

    it('withEmptyArray', function () {
      return promise.fullyResolved([]).then(function (resolved) {
        assert.deepStrictEqual([], resolved)
      })
    })

    it('withEmptyHash', function () {
      return promise.fullyResolved({}).then(function (resolved) {
        assert.deepStrictEqual({}, resolved)
      })
    })

    it('arrayWithPromisedHash', function () {
      var obj = { foo: 'bar' }
      const array = [Promise.resolve(obj)]

      return promise.fullyResolved(array).then(function (resolved) {
        assert.deepStrictEqual(resolved, [obj])
      })
    })
  })

  describe('finally', function () {
    it('successful callback does not suppress original error', async () => {
      let p = Promise.reject(new StubError())
      let called = false

      try {
        await promise.finally(p, function () {
          called = true
        })
        fail('should have thrown')
      } catch (e) {
        assertIsStubError(e)
        assert.ok(called)
      }
    })

    it('failing callback suppresses original error', async () => {
      let p = Promise.reject(Error('original'))

      try {
        await promise.finally(p, throwStubError)
        fail('should have thrown')
      } catch (e) {
        assertIsStubError(e)
      }
    })

    it('callback throws after fulfilled promise', async () => {
      try {
        await promise.finally(Promise.resolve(), throwStubError)
        fail('should have thrown')
      } catch (e) {
        assertIsStubError(e)
      }
    })

    it('callback returns rejected promise', async () => {
      try {
        await promise.finally(Promise.resolve(), () => Promise.reject(new StubError()))
        fail('should have thrown')
      } catch (e) {
        assertIsStubError(e)
      }
    })

    it('returned promise resolves with callback result', async () => {
      let value = await promise.finally(Promise.resolve(1), () => 2)
      assert.strictEqual(value, 2)
    })
  })

  describe('checkedNodeCall', function () {
    it('functionThrows', function () {
      return promise.checkedNodeCall(throwStubError).then(assert.fail, assertIsStubError)
    })

    it('functionReturnsAnError', function () {
      return promise
        .checkedNodeCall(function (callback) {
          callback(new StubError())
        })
        .then(assert.fail, assertIsStubError)
    })

    it('functionReturnsSuccess', function () {
      var success = 'success!'
      return promise
        .checkedNodeCall(function (callback) {
          callback(null, success)
        })
        .then((value) => assert.strictEqual(success, value))
    })

    it('functionReturnsAndThrows', function () {
      var error = new Error('boom')
      var error2 = new Error('boom again')
      return promise
        .checkedNodeCall(function (callback) {
          callback(error)
          throw error2
        })
        .then(assert.fail, (e) => assert.strictEqual(error, e))
    })

    it('functionThrowsAndReturns', function () {
      var error = new Error('boom')
      var error2 = new Error('boom again')
      return promise
        .checkedNodeCall(function (callback) {
          setTimeout(() => callback(error), 10)
          throw error2
        })
        .then(assert.fail, (e) => assert.strictEqual(error2, e))
    })
  })

  describe('map', function () {
    it('(base case)', function () {
      const a = [1, 2, 3]
      return promise
        .map(a, function (value, index, a2) {
          assert.strictEqual(a, a2)
          assert.strictEqual('number', typeof index, 'not a number')
          return value + 1
        })
        .then(function (value) {
          assert.deepStrictEqual([2, 3, 4], value)
        })
    })

    it('omitsDeleted', function () {
      const a = [0, 1, 2, 3, 4, 5, 6]
      delete a[1]
      delete a[3]
      delete a[4]
      delete a[6]

      const expected = [0, NaN, 4, NaN, NaN, 25, NaN]

      return promise
        .map(a, function (value) {
          return value * value
        })
        .then(function (value) {
          assert.deepStrictEqual(expected, value)
        })
    })

    it('emptyArray', function () {
      return promise
        .map([], function (value) {
          return value + 1
        })
        .then(function (value) {
          assert.deepStrictEqual([], value)
        })
    })

    it('inputIsPromise', function () {
      var input = defer()
      var result = promise.map(input.promise, function (value) {
        return value + 1
      })

      var pair = callbackPair(function (value) {
        assert.deepStrictEqual([2, 3, 4], value)
      })
      result = result.then(pair.callback, pair.errback)

      setTimeout(function () {
        pair.assertNeither()
        input.resolve([1, 2, 3])
      }, 10)

      return result
    })

    it('waitsForFunctionResultToResolve', function () {
      var innerResults = [defer(), defer()]

      var result = promise.map([1, 2], function (_value, index) {
        return innerResults[index].promise
      })

      var pair = callbackPair(function (value) {
        assert.deepStrictEqual(['a', 'b'], value)
      })
      result = result.then(pair.callback, pair.errback)

      return NativePromise.resolve()
        .then(function () {
          pair.assertNeither()
          innerResults[0].resolve('a')
        })
        .then(function () {
          pair.assertNeither()
          innerResults[1].resolve('b')
          return result
        })
        .then(pair.assertCallback)
    })

    it('rejectsPromiseIfFunctionThrows', function () {
      return promise.map([1], throwStubError).then(assert.fail, assertIsStubError)
    })

    it('rejectsPromiseIfFunctionReturnsRejectedPromise', function () {
      return promise
        .map([1], function () {
          return createRejectedPromise(new StubError())
        })
        .then(assert.fail, assertIsStubError)
    })

    it('stopsCallingFunctionIfPreviousIterationFailed', function () {
      var count = 0
      return promise
        .map([1, 2, 3, 4], function () {
          count++
          if (count === 3) {
            throw new StubError()
          }
        })
        .then(assert.fail, function (e) {
          assertIsStubError(e)
          assert.strictEqual(3, count)
        })
    })

    it('rejectsWithFirstRejectedPromise', function () {
      var innerResult = [
        Promise.resolve(),
        createRejectedPromise(new StubError()),
        createRejectedPromise(Error('should be ignored')),
      ]
      var count = 0
      return promise
        .map([1, 2, 3, 4], function (_value, index) {
          count += 1
          return innerResult[index]
        })
        .then(assert.fail, function (e) {
          assertIsStubError(e)
          assert.strictEqual(2, count)
        })
    })

    it('preservesOrderWhenMapReturnsPromise', function () {
      var deferreds = [defer(), defer(), defer(), defer()]
      var result = promise.map(deferreds, function (value) {
        return value.promise
      })

      var pair = callbackPair(function (value) {
        assert.deepStrictEqual([0, 1, 2, 3], value)
      })
      result = result.then(pair.callback, pair.errback)

      return Promise.resolve()
        .then(function () {
          pair.assertNeither()
          for (let i = deferreds.length; i > 0; i -= 1) {
            deferreds[i - 1].resolve(i - 1)
          }
          return result
        })
        .then(pair.assertCallback)
    })
  })

  describe('filter', function () {
    it('basicFiltering', function () {
      const a = [0, 1, 2, 3]
      return promise
        .filter(a, function (val, index, a2) {
          assert.strictEqual(a, a2)
          assert.strictEqual('number', typeof index, 'not a number')
          return val > 1
        })
        .then(function (val) {
          assert.deepStrictEqual([2, 3], val)
        })
    })

    it('omitsDeleted', function () {
      const a = [0, 1, 2, 3, 4, 5, 6]
      delete a[3]
      delete a[4]

      return promise
        .filter(a, function (value) {
          return value > 1 && value < 6
        })
        .then(function (val) {
          assert.deepStrictEqual([2, 5], val)
        })
    })

    it('preservesInputs', function () {
      const a = [0, 1, 2, 3]

      return promise
        .filter(a, function (_value, i, a2) {
          assert.strictEqual(a, a2)
          // Even if a function modifies the input array, the original value
          // should be inserted into the new array.
          a2[i] = a2[i] - 1
          return a2[i] >= 1
        })
        .then(function (val) {
          assert.deepStrictEqual([2, 3], val)
        })
    })

    it('inputIsPromise', function () {
      const input = defer()
      let result = promise.filter(input.promise, function (value) {
        return value > 1 && value < 3
      })

      const pair = callbackPair(function (value) {
        assert.deepStrictEqual([2], value)
      })
      result = result.then(pair.callback, pair.errback)
      return NativePromise.resolve()
        .then(function () {
          pair.assertNeither()
          input.resolve([1, 2, 3])
          return result
        })
        .then(pair.assertCallback)
    })

    it('waitsForFunctionResultToResolve', function () {
      const innerResults = [defer(), defer()]

      let result = promise.filter([1, 2], function (_value, index) {
        return innerResults[index].promise
      })

      const pair = callbackPair(function (value) {
        assert.deepStrictEqual([2], value)
      })
      result = result.then(pair.callback, pair.errback)
      return NativePromise.resolve()
        .then(function () {
          pair.assertNeither()
          innerResults[0].resolve(false)
        })
        .then(function () {
          pair.assertNeither()
          innerResults[1].resolve(true)
          return result
        })
        .then(pair.assertCallback)
    })

    it('rejectsPromiseIfFunctionReturnsRejectedPromise', function () {
      return promise
        .filter([1], function () {
          return createRejectedPromise(new StubError())
        })
        .then(assert.fail, assertIsStubError)
    })

    it('stopsCallingFunctionIfPreviousIterationFailed', function () {
      var count = 0
      return promise
        .filter([1, 2, 3, 4], function () {
          count++
          if (count === 3) {
            throw new StubError()
          }
        })
        .then(assert.fail, function (e) {
          assertIsStubError(e)
          assert.strictEqual(3, count)
        })
    })

    it('rejectsWithFirstRejectedPromise', function () {
      var innerResult = [
        Promise.resolve(),
        createRejectedPromise(new StubError()),
        createRejectedPromise(Error('should be ignored')),
      ]

      return promise
        .filter([1, 2, 3, 4], function (_value, index) {
          assert.ok(index < innerResult.length)
          return innerResult[index]
        })
        .then(assert.fail, assertIsStubError)
    })

    it('preservesOrderWhenFilterReturnsPromise', function () {
      const deferreds = [defer(), defer(), defer(), defer()]
      let result = promise.filter([0, 1, 2, 3], function (_value, index) {
        return deferreds[index].promise
      })

      const pair = callbackPair(function (value) {
        assert.deepStrictEqual([1, 2], value)
      })
      result = result.then(pair.callback, pair.errback)

      return NativePromise.resolve()
        .then(function () {
          pair.assertNeither()
          for (let i = deferreds.length - 1; i >= 0; i -= 1) {
            deferreds[i].resolve(i > 0 && i < 3)
          }
          return result
        })
        .then(pair.assertCallback)
    })
  })
})
