import { EventEmitter } from 'events';

class EventBus extends EventEmitter {
  constructor(options = {}) {
    super();
    this.setMaxListeners(options.maxListeners || 100);
    this.eventHistory = [];
    this.maxHistorySize = options.maxHistorySize || 1000;
    this.metrics = {
      eventsEmitted: 0,
      handlersCalled: 0,
      errors: 0,
    };
  }

  emit(event, data) {
    const timestamp = Date.now();
    const eventEntry = { event, data, timestamp };
    this.eventHistory.push(eventEntry);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
    this.metrics.eventsEmitted++;
    super.emit(event, data);
    return true;
  }

  on(event, listener, options = {}) {
    const wrappedListener = async (data) => {
      try {
        this.metrics.handlersCalled++;
        await listener(data);
      } catch (error) {
        this.metrics.errors++;
        this.emit('error', { event, listener: listener.name, error });
      }
    };
    wrappedListener.originalListener = listener;
    wrappedListener.event = event;
    return super.on(event, wrappedListener, options);
  }

  once(event, listener, options = {}) {
    const wrappedListener = async (data) => {
      try {
        this.metrics.handlersCalled++;
        await listener(data);
      } catch (error) {
        this.metrics.errors++;
        this.emit('error', { event, listener: listener.name, error });
      }
    };
    wrappedListener.originalListener = listener;
    wrappedListener.event = event;
    return super.once(event, wrappedListener, options);
  }

  off(event, listener) {
    const listeners = this.listeners(event);
    for (const l of listeners) {
      if (l.originalListener === listener || l === listener) {
        super.off(event, l);
      }
    }
    return this;
  }

  async emitAsync(event, data, timeout = 5000) {
    const listeners = this.listeners(event);
    if (listeners.length === 0) return [];

    const promises = listeners.map(
      listener =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`Handler timeout for event: ${event}`));
          }, timeout);
          Promise.resolve(listener(data))
            .then(result => {
              clearTimeout(timer);
              resolve(result);
            })
            .catch(error => {
              clearTimeout(timer);
              reject(error);
            });
        })
    );

    return Promise.allSettled(promises);
  }

  getHistory(event = null) {
    if (event) {
      return this.eventHistory.filter(e => e.event === event);
    }
    return [...this.eventHistory];
  }

  getMetrics() {
    return { ...this.metrics };
  }

  getListenerCount(event = null) {
    if (event) {
      return this.listenerCount(event);
    }
    return this.eventNames().reduce((acc, evt) => acc + this.listenerCount(evt), 0);
  }

  waitFor(event, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeout);

      const listener = data => {
        clearTimeout(timer);
        this.off(event, listener);
        resolve(data);
      };

      this.on(event, listener);
    });
  }

  pipeTo(targetEventBus, events = null, transform = null) {
    const filterEvents = events || /.*/;
    const listener = (data, eventName) => {
      if (filterEvents instanceof RegExp) {
        if (!filterEvents.test(eventName)) return;
      } else if (Array.isArray(filterEvents)) {
        if (!filterEvents.includes(eventName)) return;
      }
      const transformedData = transform ? transform(data) : data;
      targetEventBus.emit(eventName, transformedData);
    };
    return { listener, filterEvents };
  }
}

const globalEventBus = new EventBus({ maxHistorySize: 500 });

export default EventBus;
export { EventBus, globalEventBus };
