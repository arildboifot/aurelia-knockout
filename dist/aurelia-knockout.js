import * as ko from 'knockout';
import {ObserverLocator} from 'aurelia-binding';
import {BehaviorPropertyObserver,ViewSlot,CompositionEngine,customAttribute} from 'aurelia-templating';
import {inject,Container} from 'aurelia-dependency-injection';
import {Loader} from 'aurelia-loader';

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

function endsWith(s, suffix) {
  return s.indexOf(suffix, s.length - suffix.length) !== -1;
}

function getMatchingProperty(result, propName) {
  let properties = Object.keys(result);
  for (let index = 0; index < properties.length; index++) {
    let prop = properties[index].toLowerCase();
    if (prop.indexOf(propName) !== -1) {
      return properties[index];
    }
  }

  return null;
}

function callEvent(element, eventName, args) {
  let viewModel = ko.dataFor(element.children[0]);

  let func = viewModel[eventName];

  if (func && typeof func === 'function') {
    func.apply(viewModel, args);
  }
}

function doComposition(element, unwrappedValue, viewModel) {
  this.buildCompositionSettings(unwrappedValue, viewModel).then((settings) => {
    composeElementInstruction.call(this, element, settings).then(() => {
      callEvent(element, 'compositionComplete', [element, element.parentElement]);
    });
  });
}

function composeElementInstruction(element, instruction) {
  instruction.viewSlot = instruction.viewSlot || new ViewSlot(element, true, this);
  return processInstruction.call(this, instruction);
}

function processInstruction(instruction) {
  instruction.container = instruction.container || this.container;
  instruction.executionContext = instruction.executionContext || this;
  instruction.viewSlot = instruction.viewSlot || this.viewSlot;
  instruction.viewResources = instruction.viewResources || this.viewResources;
  instruction.currentBehavior = instruction.currentBehavior || this.currentBehavior;

  return this.compositionEngine.compose(instruction).then((next) => {
    this.currentBehavior = next;
    this.currentViewModel = next ? next.executionContext : null;
  });
}

function loadModule(moduleId, loader) {
  return loader.loadModule(moduleId);
}



@inject(CompositionEngine, Container, Loader)
export class KnockoutComposition {

  constructor(compositionEngine: CompositionEngine, container: Container, loader: Loader) {
    this.compositionEngine = compositionEngine;
    this.container = container;
    this.loader = loader;
  }

  /**
   * Registers the `compose` Knockout Binding to use Compositions in your Views.
   */
  register(): void {
    window.ko = ko;

    ko.bindingHandlers.compose = {
      update: (element, valueAccessor, allBindings, viewModel) => {
        let value = valueAccessor();

        if (element.childElementCount > 0) {
          // Remove previous composed view
          callEvent(element, 'detached', [element, element.parentElement]);

          while (element.firstChild) {
            element.removeChild(element.firstChild);
          }
        }

        doComposition.call(this, element, ko.unwrap(value), viewModel);
      }
    };

    ko.virtualElements.allowedBindings["compose"] = true;
  }

  /** internal: do not use */
  buildCompositionSettings(value: any, bindingContext: any): Promise<any> {
    let view;
    let moduleId;
    let viewModel;
    let activationData;

    // See http://durandaljs.com/documentation/Using-Composition.html

    if (typeof value === 'string') {
      if (endsWith(value, '.html')) {
        // The name of the html view (assuming that the model name is equivalent to the view)
        view = value;
        moduleId = value.substr(0, value.length - 5);
      } else {
        // The name of the module (moduleId)
        moduleId = value;
      }
    } else if (typeof value === 'object' && value) {
      if (value.view && !value.model) {
        // Only view is set. Bind it to the current viewModel
        view = value.view;
        viewModel = bindingContext;
      } else if (!value.view && value.model) {
        // Only viewModel is set.
        viewModel = value.model;
      } else if (value.view && value.model) {
        // Both model and view are set
        view = value.view;
        viewModel = value.model;
      } else {
        // The value is a viewModel instance
        viewModel = value;
      }

      if (value.activationData) {
        activationData = value.activationData;
      }

      if (typeof viewModel === 'string') {
        // The model is a moduleId
        moduleId = viewModel;
        viewModel = null;
      }
    } else if (typeof value === 'function') {
      // Call the constructor
      viewModel = value();
    }

    let settings = { view: view, viewModel: viewModel, model: activationData };

    if (!viewModel && moduleId) {
      return this.getViewModelInstance(moduleId).then((modelInstance) => {
        settings.viewModel = modelInstance;
        return Promise.resolve(settings);
      });
    }

    return Promise.resolve(settings);
  }

  /** internal: do not use */
  getViewModelInstance(moduleId: string): Promise<any> {
    let index = moduleId.lastIndexOf("/");
    let fileName = moduleId.substr(index === -1 ? 0 : index + 1).toLowerCase();

    return loadModule(moduleId, this.loader).then((result) => {
      if (typeof result !== 'function') {
        // Try to find a property which name matches the filename of the module
        let constructorPropName = getMatchingProperty(result, fileName);

        if (constructorPropName) {
          // Use function of property.
          // This occurs if the constructor function is exported by the module.
          result = result[constructorPropName];
        } else {
          // The module returns an instance.
          return result;
        }
      }

      return this.container.get(result);
    });
  }
}

function getFirstBoundChild(rootNode) {
  var data = ko.dataFor(rootNode);
  if (data) {
    return rootNode;
  }

  for (var i = 0; i < rootNode.children.length; i++) {
    var child = rootNode.children[i];
    var childData = getFirstBoundChild(child);
    if (childData) {
      return childData;
    }
  }

  return null;
}


@customAttribute('knockout')
@inject(Element)
export class KnockoutCustomAttribute {

  constructor(element) {
    this.element = element;
  }

  static register() {
    ko.bindingHandlers.stopKoBinding = {
      init: function () {
        return { controlsDescendantBindings: true };
      }
    };

    ko.virtualElements.allowedBindings.stopKoBinding = true;
  }

  /** internal: do not use */
  bind(executionContext) {
    var data = getFirstBoundChild(this.element);
    if (data) {
      var startComment = document.createComment(" ko stopKoBinding: true ");
      var endComment = document.createComment(" /ko ");

      var parentNode = data.parentElement;
      parentNode.insertBefore(startComment, data);
      parentNode.appendChild(endComment);
    }

    ko.applyBindings(executionContext, this.element);
  }

  /** internal: do not use */
  unbind() {
    ko.cleanNode(this.element);
  }
}
