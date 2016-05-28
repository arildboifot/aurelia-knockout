'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KnockoutBindable = undefined;

var _dec, _class;

var _aureliaBinding = require('aurelia-binding');

var _aureliaTemplating = require('aurelia-templating');

var _aureliaDependencyInjection = require('aurelia-dependency-injection');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var KnockoutBindable = exports.KnockoutBindable = (_dec = (0, _aureliaDependencyInjection.inject)(_aureliaBinding.ObserverLocator), _dec(_class = function () {
  function KnockoutBindable(observerLocator) {
    _classCallCheck(this, KnockoutBindable);

    this.subscriptions = [];

    this.observerLocator = observerLocator;
  }

  KnockoutBindable.prototype.applyBindableValues = function applyBindableValues(data, target, applyOnlyObservables) {
    var _this = this;

    data = data || {};
    target = target || {};
    applyOnlyObservables = applyOnlyObservables === undefined ? true : applyOnlyObservables;

    var keys = Object.keys(data);

    keys.forEach(function (key) {
      var outerValue = data[key];
      var isObservable = ko.isObservable(outerValue);

      if (isObservable || !applyOnlyObservables) {
        (function () {
          var observer = _this.getObserver(target, key);

          if (observer && observer instanceof _aureliaTemplating.BehaviorPropertyObserver) {
            observer.setValue(isObservable ? ko.unwrap(outerValue) : outerValue);
          }

          if (isObservable) {
            _this.subscriptions.push(outerValue.subscribe(function (newValue) {
              observer.setValue(newValue);
            }));
          }
        })();
      }
    });

    var originalUnbind = target.unbind;

    target.unbind = function () {
      _this.subscriptions.forEach(function (subscription) {
        subscription.dispose();
      });

      _this.subscriptions = [];

      if (originalUnbind) {
        originalUnbind.call(target);
      }
    };
  };

  KnockoutBindable.prototype.getObserver = function getObserver(target, key) {
    return this.observerLocator.getObserver(target, key);
  };

  return KnockoutBindable;
}()) || _class);