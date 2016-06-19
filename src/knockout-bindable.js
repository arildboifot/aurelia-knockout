import {ObserverLocator} from 'aurelia-binding';
import {BehaviorPropertyObserver} from 'aurelia-templating';
import {inject} from 'aurelia-dependency-injection';

@inject(ObserverLocator)
export class KnockoutBindable {

  observerLocator: ObserverLocator;
  subscriptions = [];

  constructor(observerLocator: ObserverLocator) {
    this.observerLocator = observerLocator;
  }

  /**
   * Applys all values from a data object (usually the activation data) to the corresponding instance fields
   * in the current view model if they are marked as @bindable. By default all matching values from the data object
   * are applied. To only apply observable values set the last parameter to `true`. Subscriptions are created
   * for all Knockout observables in the data object to update the view-model values respectively.
   *
   * @param data - the data object
   * @param target - the target view model
   * @param applyOnlyObservables - `true` if only observable values should be applied, false by default.
   */
  applyBindableValues(data: any, target: any, applyOnlyObservables: boolean): void {
    data = data || {};
    target = target || {};
    applyOnlyObservables = applyOnlyObservables === undefined ? true : applyOnlyObservables;

    let keys = Object.keys(data);

    keys.forEach((key) => {
      let outerValue = data[key];
      let isObservable = ko.isObservable(outerValue);

      if (isObservable || !applyOnlyObservables) {
        let observer = this.getObserver(target, key);

        if (observer && observer instanceof BehaviorPropertyObserver) {
          observer.setValue(isObservable ? ko.unwrap(outerValue) : outerValue);
        }

        if (isObservable) {
          this.subscriptions.push(outerValue.subscribe((newValue) => {
            observer.setValue(newValue);
          }));
        }
      }
    });


    let originalUnbind = target.unbind;

    target.unbind = () => {
      this.subscriptions.forEach((subscription) => {
        subscription.dispose();
      });

      this.subscriptions = [];

      if (originalUnbind) {
        originalUnbind.call(target);
      }
    };
  }

  /** internal: do not use */
  getObserver(target, key) {
    return this.observerLocator.getObserver(target, key);
  }
}
